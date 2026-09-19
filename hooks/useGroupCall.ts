'use client';

// ═══════════════════════════════════════════════════════════════════════════
// useGroupCall — 2-4 person mesh call with live captions + translation.
//
// Each participant transcribes THEIR OWN voice (the browser speech service, or
// our Whisper endpoint when that service is missing/broken) and broadcasts it
// per UTTERANCE (uid). Each receiver translates every finished utterance into
// THEIR OWN selected language — "I speak Spanish" means everyone else's words
// arrive in Spanish, whatever each of them speaks.
//
// The call engine is a plain object (not hooks): its timers, retries and
// callbacks share one set of mutable fields with no stale closures. React only
// renders the state the engine dispatches.
// ═══════════════════════════════════════════════════════════════════════════

import { useReducer, useRef, useEffect } from 'react';
import type { Dispatch } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import type {
  UseGroupCallReturn, Participant, SubtitleEntry, JoinOptions, SlotIndex,
  DataChannelMessage, ParticipantSlot, CallType, CallPhase, SttEngine, SttState,
} from '@/app/lib/group-call/types';
import type {
  SpeechRecognitionInstance,
  SpeechRecognitionEvent as SREvent,
  SpeechRecognitionErrorEvent as SRErrorEvent,
  SpeechRecognitionResultList,
} from '@/app/lib/speech-types';
import { SPEECH_AUDIO } from '@/app/lib/audio-constraints';
import { getSpeechCode } from '@/app/lib/languages';

// ─── Constants ────────────────────────────────────────────────────────────────

const VAD_INTERVAL = 200;
const LOCAL_VAD_INTERVAL = 100;
const VAD_HOLD_MS = 450; // speaking ring stays lit this long after the last voiced sample (no flicker)
const SWEEP_INTERVAL = 1000;
const MAX_SUBTITLES = 80; // conversation history kept (was an 8-second window)
const STALE_LIVE_MS = 6000; // a remote line silent this long is finalized (its final got lost / speaker left)
const STABLE_COMMIT_MS = 1100; // my interim unchanged this long = end of phrase → commit it as final
const MAX_UTTERANCE_WORDS = 40; // force-commit long monologues so listeners get translations
const INTERIM_SEND_MS = 250; // broadcast at most 4 interim updates per second
const LIVE_XLATE_GAP_MS = 1300; // provisional translation of a live line at most this often
const LIVE_XLATE_MIN_WORDS = 3;
const LIVE_XLATE_PER_MIN = 30; // per-receiver budget; finals are never budgeted
const CONTEXT_LINES = 5; // speaker's previous lines sent as translation context
const MAX_CONNECT_ATTEMPTS = 8;
const WHISPER_SILENCE_END_MS = 900;
const WHISPER_MIN_VOICE_MS = 300;
const WHISPER_IDLE_ROTATE_MS = 5000;
const WHISPER_MAX_SEGMENT_MS = 14000;
const WHISPER_BLIND_SEGMENT_MS = 4000;
const DEAF_STT_VOICE_MS = 6000; // I clearly spoke this long and the speech service never heard a word
const HEARTBEAT_EVERY_TICKS = 5; // ping peers every 5 sweeps (≈5s)
const PEER_SILENT_POOR_MS = 15000; // no message from a peer this long → tile says "Can't reach"
const PEER_SILENT_DROP_MS = 60000; // …this long → they're gone (phone died / network lost)

const PEERJS_SERVERS = [
  { host: '0.peerjs.com', port: 443, secure: true, path: '/' },
  { host: 'peerjs.92k.de', port: 443, secure: true, path: '/' },
];

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const GROUP_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 },
           frameRate: { ideal: 24, max: 30 } },
  audio: { ...SPEECH_AUDIO },
};

const GROUP_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  video: false,
  audio: { ...SPEECH_AUDIO },
};

const MIC_DENIED_COPY =
  'Microphone access is blocked. Allow it for this site (on iPhone: Settings → Entrevoz → Microphone), then tap Retry. · ' +
  'El micrófono está bloqueado. Permítelo para este sitio (en iPhone: Ajustes → Entrevoz → Micrófono) y toca Reintentar.';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function newUid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

// Comparison-only normalization (case + common punctuation).
function normText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?¡¿;:"'“”‘’…()[\]-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Merge speech results into one session transcript. Handles all three engines:
// Chrome desktop (separate phrases), Android Chrome (each result repeats the
// whole session so far), iOS WebKit (one ever-growing result).
function mergeCumulative(acc: string, next: string): string {
  if (!acc) return next;
  const a = normText(acc);
  const n = normText(next);
  if (!n) return acc;
  if (n.startsWith(a)) return next; // cumulative repeat (Android)
  if (splitWords(n).length >= 3 && a.endsWith(n)) return acc; // duplicated multi-word final
  return `${acc} ${next}`;
}

function mergeResults(results: SpeechRecognitionResultList): { all: string; finals: string } {
  let all = '';
  let finals = '';
  let finalPrefix = true;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const text = (r && r[0] ? r[0].transcript : '').trim();
    if (!text) continue;
    all = mergeCumulative(all, text);
    // Finals form a prefix of the list; anything after the first interim is
    // still provisional even if an engine marks it final out of order.
    if (r.isFinal && finalPrefix) finals = mergeCumulative(finals, text);
    else finalPrefix = false;
  }
  return { all, finals };
}

const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

function cleanLang(raw: unknown, fallback = 'en'): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return LANG_RE.test(s) ? s : fallback;
}

function baseLang(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0];
}

function sameLanguage(a: string, b: string): boolean {
  return baseLang(a) === baseLang(b);
}

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 30) : '';
  return s || 'Guest';
}

function clampThreshold(x: number): number {
  return Math.min(0.05, Math.max(0.008, x));
}

// 20th percentile of the calibration window: the room's quiet floor, robust
// to someone talking through the first second and a half.
function quietFloor(samples: number[]): number {
  if (!samples.length) return 0.004;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.2)];
}

function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* keep looking */
    }
  }
  return '';
}

type XlateResult = { ok: true; text: string } | { ok: false; retryable: boolean; status: number };

async function postTranslate(
  text: string,
  from: string,
  to: string,
  context?: string[],
  signal?: AbortSignal,
): Promise<XlateResult> {
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        from,
        to,
        ...(context && context.length ? { context: context.map((l) => l.slice(0, 600)) } : {}),
      }),
      signal,
    });
    if (!res.ok) return { ok: false, retryable: res.status === 429 || res.status >= 500, status: res.status };
    const d = (await res.json()) as { translation?: unknown; translated?: unknown; untranslated?: unknown };
    const out =
      typeof d.translation === 'string' ? d.translation.trim()
      : typeof d.translated === 'string' ? d.translated.trim()
      : '';
    // Total provider failure comes back as untranslated:true + an EMPTY
    // string — never show that (or the source text) as a translation.
    if (!out || d.untranslated === true) return { ok: false, retryable: true, status: 200 };
    return { ok: true, text: out };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, retryable: false, status: 0 };
    return { ok: false, retryable: true, status: 0 };
  }
}

function blankParticipant(slot: number, patch: Partial<Participant>): Participant {
  return {
    slotIndex: slot as SlotIndex,
    deviceId: '',
    displayName: 'Guest',
    language: 'en',
    peerId: '',
    status: 'connecting',
    isSpeaking: false,
    isMuted: false,
    isCameraOff: false,
    stream: null,
    connectionQuality: 2,
    ...patch,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface State {
  phase: CallPhase;
  error: string | null;
  mySlotIndex: SlotIndex | null;
  myLanguage: string;
  isMuted: boolean;
  isCameraOff: boolean;
  localStream: MediaStream | null;
  participants: (Participant | null)[];
  subtitles: SubtitleEntry[];
  sttState: SttState;
  sttEngine: SttEngine;
  localSpeaking: boolean;
}

type Action =
  | { type: 'SET_PHASE'; phase: CallPhase; error?: string }
  | { type: 'SET_SLOT'; slotIndex: SlotIndex }
  | { type: 'SET_LANGUAGE'; language: string }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'SET_CAMERA_OFF'; off: boolean }
  | { type: 'SET_LOCAL_STREAM'; stream: MediaStream | null }
  | { type: 'PARTICIPANT_UPSERT'; slotIndex: number; patch: Partial<Participant> }
  | { type: 'PARTICIPANT_PATCH'; slotIndex: number; patch: Partial<Participant> }
  | { type: 'PARTICIPANT_REMOVE'; slotIndex: number }
  | { type: 'SUB_UPSERT'; entry: SubtitleEntry }
  | { type: 'SUB_REMOVE'; id: string }
  | { type: 'SET_STT'; sttState?: SttState; sttEngine?: SttEngine }
  | { type: 'SET_LOCAL_SPEAKING'; speaking: boolean };

const INIT: State = {
  phase: 'lobby',
  error: null,
  mySlotIndex: null,
  myLanguage: 'en',
  isMuted: false,
  isCameraOff: false,
  localStream: null,
  participants: [null, null, null, null],
  subtitles: [],
  sttState: 'idle',
  sttEngine: 'none',
  localSpeaking: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase, error: action.error ?? null };
    case 'SET_SLOT':
      return { ...state, mySlotIndex: action.slotIndex };
    case 'SET_LANGUAGE':
      return state.myLanguage === action.language ? state : { ...state, myLanguage: action.language };
    case 'SET_MUTED':
      return state.isMuted === action.muted ? state : { ...state, isMuted: action.muted };
    case 'SET_CAMERA_OFF':
      return state.isCameraOff === action.off ? state : { ...state, isCameraOff: action.off };
    case 'SET_LOCAL_STREAM':
      return { ...state, localStream: action.stream };
    case 'PARTICIPANT_UPSERT': {
      const cur = state.participants[action.slotIndex];
      const p = state.participants.slice();
      p[action.slotIndex] = cur ? { ...cur, ...action.patch } : blankParticipant(action.slotIndex, action.patch);
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_PATCH': {
      const cur = state.participants[action.slotIndex];
      if (!cur) return state;
      const keys = Object.keys(action.patch) as (keyof Participant)[];
      // Bail out when nothing changed — VAD/quality ticks must not re-render the call
      if (!keys.some((k) => cur[k] !== action.patch[k])) return state;
      const p = state.participants.slice();
      p[action.slotIndex] = { ...cur, ...action.patch };
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_REMOVE': {
      if (!state.participants[action.slotIndex]) return state;
      const p = state.participants.slice();
      p[action.slotIndex] = null;
      return { ...state, participants: p };
    }
    case 'SUB_UPSERT': {
      const idx = state.subtitles.findIndex((s) => s.id === action.entry.id);
      if (idx >= 0) {
        const next = state.subtitles.slice();
        next[idx] = action.entry;
        return { ...state, subtitles: next };
      }
      const next = state.subtitles.concat(action.entry);
      return {
        ...state,
        subtitles: next.length > MAX_SUBTITLES ? next.slice(next.length - MAX_SUBTITLES) : next,
      };
    }
    case 'SUB_REMOVE': {
      const next = state.subtitles.filter((s) => s.id !== action.id);
      return next.length === state.subtitles.length ? state : { ...state, subtitles: next };
    }
    case 'SET_STT': {
      const sttState = action.sttState ?? state.sttState;
      const sttEngine = action.sttEngine ?? state.sttEngine;
      if (sttState === state.sttState && sttEngine === state.sttEngine) return state;
      return { ...state, sttState, sttEngine };
    }
    case 'SET_LOCAL_SPEAKING':
      return state.localSpeaking === action.speaking ? state : { ...state, localSpeaking: action.speaking };
    default:
      return state;
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

interface RosterEntry {
  peerId: string;
  displayName: string;
  language: string;
  deviceId: string;
  attempts: number;
  connectTimer: ReturnType<typeof setTimeout> | null;
}

interface RemoteVad {
  analyser: AnalyserNode;
  src: MediaStreamAudioSourceNode;
  tracks: MediaStreamTrack[];
  streamId: string;
  threshold: number;
  calib: number[];
  calibUntil: number;
  lastAboveAt: number;
  speaking: boolean;
}

interface LocalVad {
  timer: ReturnType<typeof setInterval> | null;
  analyser: AnalyserNode | null;
  src: MediaStreamAudioSourceNode | null;
  track: MediaStreamTrack | null;
  threshold: number;
  calib: number[];
  calibUntil: number;
  lastRms: number;
  lastVoiceAt: number;
  voicedSamples: number;
  verified: boolean; // the meter has proven it hears me — only then may it gate anything
  speaking: boolean;
  voiceMsNoResult: number;
}

function freshLocalVad(): LocalVad {
  return {
    timer: null, analyser: null, src: null, track: null, threshold: 0.012, calib: [], calibUntil: 0,
    lastRms: 0, lastVoiceAt: 0, voicedSamples: 0, verified: false, speaking: false, voiceMsNoResult: 0,
  };
}

// My current utterance within one recognizer session.
interface Segment {
  uid: string;
  lang: string; // language the recognizer was running in — the label peers translate FROM
  committedWords: number; // session words already sent as finals
  pending: string; // uncommitted (live) text of the current utterance
  startedAt: number;
  lastSentAt: number; // 0 = nothing of this utterance has been shown to anyone yet
  lastSentText: string;
  hidden: boolean; // suspected speaker echo — not broadcast unless my own mic confirms
}

function freshSegment(lang: string): Segment {
  return { uid: newUid(), lang, committedWords: 0, pending: '', startedAt: 0, lastSentAt: 0, lastSentText: '', hidden: false };
}

interface WhisperSeg {
  startedAt: number;
  hadVoice: boolean;
  voiceMs: number;
  lastVoiceAt: number;
  send: boolean;
}

interface WhisperEngine {
  gen: number;
  track: MediaStreamTrack;
  stream: MediaStream;
  mime: string;
  recorder: MediaRecorder | null;
  seg: WhisperSeg | null;
  tick: ReturnType<typeof setInterval> | null;
}

interface LiveXlate {
  lastAt: number;
  lastWords: number;
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
}

interface GroupEngine {
  joinRoom: (roomCode: string, opts: JoinOptions) => Promise<void>;
  leaveRoom: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  setMyLanguage: (lang: string) => void;
  primeAudio: () => void;
  retryTranslation: (id: string) => void;
  restartCaptions: () => void;
  switchToBackupCaptions: () => void;
  retryConnection: (slotIndex: number) => void;
  onVisibility: (hidden: boolean) => void;
  isInCall: () => boolean;
}

function createGroupEngine(dispatch: Dispatch<Action>): GroupEngine {
  // ── Call state ──
  let phase: CallPhase = 'lobby';
  let left = false;
  let peer: Peer | null = null;
  let peerReconnects = 0;
  let localStream: MediaStream | null = null;
  const dataConns = new Map<number, DataConnection>();
  const mediaConns = new Map<number, MediaConnection>();
  const roster = new Map<number, RosterEntry>();
  let roomCode = '';
  let mySlot = -1;
  let myLang = 'en';
  let callType: CallType = 'video';
  let displayName = '';
  let deviceId = '';
  let myPeerId = '';
  let muted = false;
  let cameraOff = false;

  // ── Audio analysis ──
  let audioCtx: AudioContext | null = null;
  const vads = new Map<number, RemoteVad>();
  let vadTimer: ReturnType<typeof setInterval> | null = null;
  let remoteSpeakingAt = 0;
  let localVad: LocalVad = freshLocalVad();
  const vadBuf = new Float32Array(512);

  // ── Captions (my voice) ──
  let engine: SttEngine = 'none';
  let sttGen = 0;
  let rec: SpeechRecognitionInstance | null = null;
  let sttRestarts = 0;
  let sttRestartTimer: ReturnType<typeof setTimeout> | null = null;
  let sttBenignEnd = false;
  let sttNetErrs = 0;
  let sttEverResult = false;
  let wasBackgrounded = false;
  let seg: Segment = freshSegment('en');
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let whisperGen = 0;
  let whisper: WhisperEngine | null = null;

  // ── Conversation ──
  const subs = new Map<string, SubtitleEntry>();
  const speakerCtx = new Map<number, string[]>();
  const liveXlate = new Map<string, LiveXlate>();
  let interimTokens = LIVE_XLATE_PER_MIN;
  let interimRefillAt = 0;
  let interimPausedUntil = 0;
  let legacySeq = 0;
  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  let sweepTicks = 0;
  const lastSeen = new Map<number, number>(); // last message from each peer (heartbeat)
  const silentPoor = new Set<number>(); // slots the heartbeat marked unreachable

  function setPhase(p: CallPhase, error?: string) {
    phase = p;
    dispatch({ type: 'SET_PHASE', phase: p, error });
  }

  function setStt(sttState?: SttState, sttEngine?: SttEngine) {
    dispatch({ type: 'SET_STT', sttState, sttEngine });
  }

  function captionsWanted(): boolean {
    return phase === 'active' && !left && !muted;
  }

  // ═══ Conversation store ════════════════════════════════════════════════════

  function upsertSub(entry: SubtitleEntry) {
    subs.set(entry.id, entry);
    if (subs.size > MAX_SUBTITLES + 20) {
      const excess: string[] = [];
      let n = subs.size - MAX_SUBTITLES;
      subs.forEach((_v, key) => {
        if (n-- > 0) excess.push(key);
      });
      excess.forEach((key) => {
        subs.delete(key);
        cancelLiveXlate(key);
      });
    }
    dispatch({ type: 'SUB_UPSERT', entry });
  }

  function patchSub(id: string, patch: Partial<SubtitleEntry>) {
    const cur = subs.get(id);
    if (cur) upsertSub({ ...cur, ...patch });
  }

  function removeSub(id: string) {
    if (!subs.has(id)) return;
    subs.delete(id);
    cancelLiveXlate(id);
    dispatch({ type: 'SUB_REMOVE', id });
  }

  // Speaker's previous finished lines (not including `current`) — sent so the
  // translator resolves pronouns/gender/references like the 1:1 path does.
  function contextFor(slot: number): string[] {
    return (speakerCtx.get(slot) ?? []).slice(-CONTEXT_LINES);
  }

  function pushContext(slot: number, text: string) {
    speakerCtx.set(slot, (speakerCtx.get(slot) ?? []).concat(text).slice(-CONTEXT_LINES));
  }

  // ═══ Translation (receiver side, into MY language) ═════════════════════════

  function cancelLiveXlate(id: string) {
    const st = liveXlate.get(id);
    if (!st) return;
    if (st.timer) clearTimeout(st.timer);
    st.controller?.abort();
    liveXlate.delete(id);
  }

  function takeInterimToken(): boolean {
    const now = Date.now();
    if (interimRefillAt === 0) interimRefillAt = now;
    const refill = ((now - interimRefillAt) / 60000) * LIVE_XLATE_PER_MIN;
    if (refill >= 1) {
      interimTokens = Math.min(LIVE_XLATE_PER_MIN, interimTokens + Math.floor(refill));
      interimRefillAt = now;
    }
    if (interimTokens <= 0) return false;
    interimTokens--;
    return true;
  }

  async function translateFinal(id: string, context: string[] | undefined, attempt = 0): Promise<void> {
    const cur = subs.get(id);
    if (!cur || !cur.isFinal || cur.isMe || left) return;
    const target = myLang;
    if (sameLanguage(cur.speakerLanguage, target)) {
      patchSub(id, { status: 'same', translated: cur.original, liveTranslated: null, targetLanguage: target });
      return;
    }
    if (cur.status !== 'translating' || cur.targetLanguage !== target) {
      patchSub(id, { status: 'translating', targetLanguage: target });
    }
    const text = cur.original;
    const res = await postTranslate(text, cur.speakerLanguage, target, attempt === 0 ? context : undefined);
    const now = subs.get(id);
    // Superseded: text changed, or I switched language (the re-translate pass owns it now)
    if (!now || now.original !== text || myLang !== target || left) return;
    if (res.ok) {
      patchSub(id, { status: 'done', translated: res.text, liveTranslated: null, targetLanguage: target });
      return;
    }
    if (res.retryable && attempt < 2) {
      setTimeout(() => { void translateFinal(id, undefined, attempt + 1); }, res.status === 429 ? 2500 : 1000 * (attempt + 1));
      return;
    }
    patchSub(id, { status: 'failed' });
  }

  // Provisional translation of a line that is still being spoken, so listeners
  // read their language while the speaker talks. Throttled and budgeted;
  // context-free (fast path). The final translation always replaces it.
  function maybeTranslateLive(id: string) {
    if (Date.now() < interimPausedUntil) return;
    const cur = subs.get(id);
    if (!cur || cur.isFinal || cur.isMe || sameLanguage(cur.speakerLanguage, myLang)) return;
    const wordCount = splitWords(cur.original).length;
    if (wordCount < LIVE_XLATE_MIN_WORDS) return;
    const st: LiveXlate = liveXlate.get(id) ?? { lastAt: 0, lastWords: 0, timer: null, controller: null };
    liveXlate.set(id, st);
    if (st.lastWords > 0 && wordCount - st.lastWords < 2) return;
    const wait = st.lastAt + LIVE_XLATE_GAP_MS - Date.now();
    if (wait > 0) {
      if (!st.timer) {
        st.timer = setTimeout(() => {
          st.timer = null;
          maybeTranslateLive(id);
        }, wait);
      }
      return;
    }
    if (!takeInterimToken()) return;
    st.lastAt = Date.now();
    st.lastWords = wordCount;
    st.controller?.abort();
    const controller = new AbortController();
    st.controller = controller;
    const text = cur.original;
    const target = myLang;
    void postTranslate(text, cur.speakerLanguage, target, undefined, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      const now = subs.get(id);
      if (!now || now.isFinal || myLang !== target) return;
      if (res.ok) patchSub(id, { liveTranslated: res.text, targetLanguage: target });
      else if (res.status === 429) interimPausedUntil = Date.now() + 30000;
    });
  }

  function finalizeSub(id: string) {
    const s = subs.get(id);
    if (!s || s.isFinal) return;
    cancelLiveXlate(id);
    if (s.isMe) {
      upsertSub({ ...s, isFinal: true, status: 'same' });
      return;
    }
    const same = sameLanguage(s.speakerLanguage, myLang);
    const context = contextFor(s.speakerSlot);
    pushContext(s.speakerSlot, s.original);
    upsertSub({
      ...s,
      isFinal: true,
      status: same ? 'same' : 'translating',
      translated: same ? s.original : null,
      targetLanguage: myLang,
    });
    if (!same) void translateFinal(id, context);
  }

  // A speaker left / went quiet mid-line: finish their open lines so nothing
  // stays stuck on "speaking…" and the words still get translated.
  function finalizeLiveFrom(slot: number) {
    const ids: string[] = [];
    subs.forEach((s) => {
      if (!s.isMe && !s.isFinal && s.speakerSlot === slot) ids.push(s.id);
    });
    ids.forEach(finalizeSub);
  }

  // I switched language: bring the recent conversation into the new one.
  function retranslateRecent() {
    const recent: SubtitleEntry[] = [];
    subs.forEach((s) => {
      if (!s.isMe && s.isFinal) recent.push(s);
    });
    recent.slice(-8).forEach((s) => {
      if (sameLanguage(s.speakerLanguage, myLang)) {
        upsertSub({ ...s, status: 'same', translated: s.original, liveTranslated: null, targetLanguage: myLang });
      } else {
        upsertSub({ ...s, status: 'translating', translated: null, liveTranslated: null, targetLanguage: myLang });
        void translateFinal(s.id, undefined);
      }
    });
  }

  function retryTranslation(id: string) {
    const s = subs.get(id);
    if (!s || s.isMe) return;
    if (!s.isFinal) {
      finalizeSub(id);
      return;
    }
    upsertSub({ ...s, status: 'translating', targetLanguage: myLang });
    void translateFinal(id, contextFor(s.speakerSlot));
  }

  // ═══ Receiving transcripts ═════════════════════════════════════════════════

  function handleTranscript(msg: Extract<DataChannelMessage, { type: 'transcript' }>, fromSlot: number) {
    const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 1000) : '';
    const isFinal = msg.isFinal === true;
    const lang = cleanLang(msg.language, roster.get(fromSlot)?.language ?? 'en');
    const uid = typeof msg.uid === 'string' && /^[a-z0-9]{4,40}$/i.test(msg.uid) ? msg.uid : null;

    let id: string;
    if (uid) {
      id = `${fromSlot}:${uid}`;
    } else {
      // Pre-uid clients send every interim as a new message — fold them into
      // one live line per speaker; each final becomes its own line.
      const liveId = `${fromSlot}:legacy-live`;
      if (isFinal) {
        removeSub(liveId);
        legacySeq += 1;
        id = `${fromSlot}:legacy-${legacySeq}`;
      } else {
        id = liveId;
      }
    }

    const existing = subs.get(id);
    if (existing?.isFinal) return; // locked — ignore late interims / duplicate finals
    if (!text) {
      if (existing) removeSub(id);
      return;
    }

    const now = Date.now();
    const same = sameLanguage(lang, myLang);
    upsertSub({
      id,
      speakerSlot: fromSlot as SlotIndex,
      speakerName: roster.get(fromSlot)?.displayName ?? existing?.speakerName ?? 'Guest',
      speakerLanguage: lang,
      isMe: false,
      original: text,
      translated: same ? text : null,
      liveTranslated: same ? null : existing?.liveTranslated ?? null,
      targetLanguage: myLang,
      isFinal,
      status: same ? 'same' : isFinal ? 'translating' : 'live',
      timestamp: existing?.timestamp ?? now,
      updatedAt: now,
    });

    if (isFinal) {
      cancelLiveXlate(id);
      const context = contextFor(fromSlot);
      pushContext(fromSlot, text);
      if (!same) void translateFinal(id, context);
    } else if (!same) {
      maybeTranslateLive(id);
    }
  }

  // ═══ Audio level meters (who is speaking) ══════════════════════════════════

  function ensureAudioCtx(): AudioContext | null {
    if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
      return audioCtx;
    } catch (err) {
      console.error('[GroupCall] AudioContext unavailable', err);
      return null;
    }
  }

  // Called inside the Join tap: iOS only lets an AudioContext run if it was
  // created/resumed in a user gesture — otherwise every level meter reads 0.
  function primeAudio() {
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function teardownVAD(slot: number) {
    const v = vads.get(slot);
    if (!v) return;
    vads.delete(slot);
    try { v.src.disconnect(); } catch { /* already gone */ }
    v.tracks.forEach((t) => { try { t.stop(); } catch { /* clone already ended */ } });
  }

  function setupVAD(slot: number, stream: MediaStream) {
    const existing = vads.get(slot);
    if (existing && existing.streamId === stream.id) return; // PeerJS fires 'stream' once per track
    teardownVAD(slot);
    const audio = stream.getAudioTracks();
    const ctx = ensureAudioCtx();
    if (!audio.length || !ctx) return;
    try {
      // Clones — analysing the original can steal the track from WebRTC on iOS Safari
      const tracks = audio.map((t) => t.clone());
      const src = ctx.createMediaStreamSource(new MediaStream(tracks));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      vads.set(slot, {
        analyser, src, tracks, streamId: stream.id, threshold: 0.012, calib: [],
        calibUntil: Date.now() + 1500, lastAboveAt: 0, speaking: false,
      });
    } catch (err) {
      console.error('[GroupCall] VAD setup failed', err);
    }
  }

  function startVAD() {
    if (vadTimer) clearInterval(vadTimer);
    vadTimer = setInterval(() => {
      const now = Date.now();
      vads.forEach((v, slot) => {
        v.analyser.getFloatTimeDomainData(vadBuf);
        const rms = rmsOf(vadBuf);
        if (now < v.calibUntil) {
          v.calib.push(rms);
          return;
        }
        if (v.calib.length) {
          v.threshold = clampThreshold(quietFloor(v.calib) * 3);
          v.calib = [];
        }
        if (rms > v.threshold) {
          v.lastAboveAt = now;
          remoteSpeakingAt = now;
        }
        const speaking = now - v.lastAboveAt < VAD_HOLD_MS;
        if (speaking !== v.speaking) {
          v.speaking = speaking;
          dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: slot, patch: { isSpeaking: speaking } });
        }
      });
    }, VAD_INTERVAL);
  }

  function stopLocalVAD() {
    if (localVad.timer) clearInterval(localVad.timer);
    try { localVad.src?.disconnect(); } catch { /* already gone */ }
    try { localVad.track?.stop(); } catch { /* already ended */ }
    localVad = freshLocalVad();
    dispatch({ type: 'SET_LOCAL_SPEAKING', speaking: false });
  }

  // My own level meter, on a clone of my ECHO-CANCELLED mic track. Drives my
  // speaking ring, the echo gate, Whisper segmentation and the deaf-STT check.
  function startLocalVAD(stream: MediaStream) {
    stopLocalVAD();
    const src0 = stream.getAudioTracks().find((t) => t.readyState === 'live');
    const ctx = ensureAudioCtx();
    if (!src0 || !ctx) return;
    try {
      const track = src0.clone();
      track.enabled = !muted;
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      const lv: LocalVad = { ...freshLocalVad(), analyser, src, track, calibUntil: Date.now() + 1500 };
      const buf = new Float32Array(512);
      lv.timer = setInterval(() => {
        const now = Date.now();
        analyser.getFloatTimeDomainData(buf);
        const rms = rmsOf(buf);
        lv.lastRms = rms;
        if (now < lv.calibUntil) {
          lv.calib.push(rms);
          return;
        }
        if (lv.calib.length) {
          lv.threshold = clampThreshold(quietFloor(lv.calib) * 3);
          lv.calib = [];
        }
        if (rms > lv.threshold && !muted) {
          lv.lastVoiceAt = now;
          lv.voicedSamples += 1;
          if (lv.voicedSamples >= 3) lv.verified = true;
          if (engine === 'webspeech') lv.voiceMsNoResult += LOCAL_VAD_INTERVAL;
        }
        const speaking = !muted && now - lv.lastVoiceAt < VAD_HOLD_MS;
        if (speaking !== lv.speaking) {
          lv.speaking = speaking;
          dispatch({ type: 'SET_LOCAL_SPEAKING', speaking });
        }
      }, LOCAL_VAD_INTERVAL);
      localVad = lv;
    } catch (err) {
      console.error('[GroupCall] Local VAD setup failed', err);
    }
  }

  function meterLive(): boolean {
    return !!localVad.analyser && audioCtx?.state === 'running';
  }

  // Laptop speakers: the browser speech service can hear OTHER people through
  // my speakers and caption them as me. Only call it echo when all three hold:
  // the meter is proven, my echo-cancelled mic heard nothing, and a remote
  // participant WAS talking — so real speech is never dropped.
  function looksLikeEcho(since: number): boolean {
    if (!localVad.verified || !meterLive()) return false;
    const from = since - 1500;
    if (localVad.lastVoiceAt >= from) return false;
    return remoteSpeakingAt >= from;
  }

  // ═══ My captions: utterance segmentation ═══════════════════════════════════

  function clearStable() {
    if (stableTimer) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }
  }

  function clearSend() {
    if (sendTimer) {
      clearTimeout(sendTimer);
      sendTimer = null;
    }
  }

  function emitMine(uid: string, text: string, isFinal: boolean, lang: string) {
    const now = Date.now();
    const id = `me:${uid}`;
    const cur = subs.get(id);
    const slot = (mySlot >= 0 ? mySlot : 0) as SlotIndex;
    upsertSub({
      id,
      speakerSlot: slot,
      speakerName: displayName || 'You',
      speakerLanguage: lang,
      isMe: true,
      original: text,
      translated: text,
      liveTranslated: null,
      targetLanguage: lang,
      isFinal,
      status: 'same',
      timestamp: cur?.timestamp ?? now,
      updatedAt: now,
    });
    broadcast({ type: 'transcript', uid, text, isFinal, language: lang, speakerSlot: slot });
  }

  function commitFinal(text: string) {
    clearStable();
    clearSend();
    const clean = text.trim();
    const { uid, lang, startedAt, lastSentAt } = seg;
    seg.uid = newUid();
    seg.pending = '';
    seg.startedAt = 0;
    seg.lastSentAt = 0;
    seg.lastSentText = '';
    seg.hidden = false;
    if (!clean) return;
    // Never shown to anyone and it looks like speaker echo → drop silently
    if (lastSentAt === 0 && looksLikeEcho(startedAt || Date.now())) return;
    emitMine(uid, clean, true, lang);
  }

  function commitPending() {
    const text = seg.pending.trim();
    if (!text) {
      clearStable();
      return;
    }
    seg.committedWords += splitWords(text).length;
    commitFinal(text);
  }

  function flushInterim() {
    sendTimer = null;
    if (!seg.pending || seg.hidden || seg.pending === seg.lastSentText) return;
    seg.lastSentAt = Date.now();
    seg.lastSentText = seg.pending;
    emitMine(seg.uid, seg.pending, false, seg.lang);
  }

  function scheduleInterimSend() {
    const wait = seg.lastSentAt + INTERIM_SEND_MS - Date.now();
    if (wait <= 0) {
      clearSend();
      flushInterim();
    } else if (!sendTimer) {
      sendTimer = setTimeout(flushInterim, wait);
    }
  }

  function updatePending(text: string) {
    const now = Date.now();
    seg.pending = text;
    if (!seg.startedAt) seg.startedAt = now;
    // Echo check until the utterance is confirmed as mine; once shown, it stays shown
    if (seg.lastSentAt === 0) seg.hidden = looksLikeEcho(seg.startedAt);
    if (!seg.hidden) scheduleInterimSend();
    clearStable();
    // End of phrase = the text stops changing. iOS never marks results final in
    // continuous mode, so without this its speakers were never translated.
    stableTimer = setTimeout(() => {
      stableTimer = null;
      commitPending();
    }, STABLE_COMMIT_MS);
    if (splitWords(text).length >= MAX_UTTERANCE_WORDS) commitPending();
  }

  function handleResults(e: SREvent, gen: number) {
    if (gen !== sttGen) return;
    sttEverResult = true;
    sttRestarts = 0;
    sttNetErrs = 0;
    localVad.voiceMsNoResult = 0;
    if (muted) return;
    const { all, finals } = mergeResults(e.results);
    const allWords = splitWords(all);
    const finalWords = splitWords(finals);
    if (finalWords.length > seg.committedWords) {
      const text = finalWords.slice(seg.committedWords).join(' ');
      seg.committedWords = finalWords.length;
      commitFinal(text); // the recognizer's final supersedes the live text of this utterance
    }
    const pendingText = allWords.slice(seg.committedWords).join(' ');
    if (pendingText && pendingText !== seg.pending) updatePending(pendingText);
  }

  // ═══ My captions: browser speech service ═══════════════════════════════════
  // Exactly ONE recognizer at a time. Every start/stop bumps sttGen, and each
  // recognizer ignores its own events once superseded — the old code's onend
  // restarted "stopped" recognizers, so mute kept transcribing and a language
  // switch left the OLD-language recognizer running under the NEW label.

  function canUseWhisper(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      !!localStream?.getAudioTracks().some((t) => t.readyState === 'live')
    );
  }

  function stopWebSpeech(flush: boolean) {
    sttGen += 1;
    if (sttRestartTimer) {
      clearTimeout(sttRestartTimer);
      sttRestartTimer = null;
    }
    const r = rec;
    rec = null;
    if (r) {
      try { r.abort(); } catch { /* already ended */ }
    }
    if (flush) {
      commitPending();
    } else {
      clearStable();
      clearSend();
      seg.pending = '';
    }
  }

  function startWebSpeech() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      if (canUseWhisper()) switchToWhisper();
      else markUnavailable();
      return;
    }
    stopWebSpeech(true);
    const gen = ++sttGen;
    seg = freshSegment(myLang);
    let r: SpeechRecognitionInstance;
    try {
      r = new SR();
    } catch (err) {
      console.error('[GroupCall] SpeechRecognition constructor failed', err);
      if (canUseWhisper()) switchToWhisper();
      else markUnavailable();
      return;
    }
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.lang = getSpeechCode(myLang); // BCP-47 (e.g. es-ES) — bare codes misfire on some engines
    r.onstart = () => {
      if (gen === sttGen) setStt('listening', 'webspeech');
    };
    r.onresult = (e: SREvent) => handleResults(e, gen);
    r.onerror = (e: SRErrorEvent) => handleSttError(e, gen);
    r.onend = () => handleSttEnd(gen);
    rec = r;
    if (sttRestarts <= 3) setStt(sttEverResult ? 'listening' : 'starting', 'webspeech');
    try {
      r.start();
    } catch (err) {
      console.error('[GroupCall] SpeechRecognition start failed', err);
      handleSttEnd(gen);
    }
  }

  function handleSttError(e: SRErrorEvent, gen: number) {
    if (gen !== sttGen) return;
    const err = e.error;
    if (err === 'no-speech' || err === 'aborted') {
      sttBenignEnd = true;
      return;
    }
    if (err === 'not-allowed') {
      // During a phone-call interruption the OS holds the mic — the visibility
      // restore restarts us. In the foreground it means the SPEECH service is
      // refused (Siri/Dictation off) while our call mic works → use Whisper.
      if (document.visibilityState === 'hidden' || wasBackgrounded) return;
      if (canUseWhisper()) switchToWhisper();
      else {
        stopWebSpeech(true);
        setStt('blocked');
      }
      return;
    }
    if (err === 'service-not-allowed' || err === 'language-not-supported') {
      if (canUseWhisper()) switchToWhisper();
      else markUnavailable();
      return;
    }
    if (err === 'network') {
      sttNetErrs += 1;
      if (sttNetErrs >= 2 && canUseWhisper()) switchToWhisper();
      return;
    }
    // audio-capture and the rest: onend's backoff restart recovers
  }

  function handleSttEnd(gen: number) {
    if (gen !== sttGen) return;
    rec = null;
    commitPending();
    if (!captionsWanted() || engine !== 'webspeech') return;
    let n: number;
    if (sttBenignEnd) {
      sttBenignEnd = false;
      sttRestarts = 0;
      n = 0;
    } else {
      sttRestarts += 1;
      n = sttRestarts;
    }
    if (n > 12 && canUseWhisper()) {
      switchToWhisper();
      return;
    }
    const delay = n <= 3 ? 120 : Math.min(400 * Math.pow(1.6, n - 3), 6000);
    if (n > 3) setStt('recovering');
    sttRestartTimer = setTimeout(() => {
      sttRestartTimer = null;
      if (gen !== sttGen || !captionsWanted() || engine !== 'webspeech') return;
      startWebSpeech();
    }, delay);
  }

  // ═══ My captions: Whisper backup ═══════════════════════════════════════════
  // Records my echo-cancelled mic in voice-activity segments and transcribes
  // each through /api/transcribe in my selected language. Recording restarts
  // the instant a segment ends, so the start of the next sentence is never cut.

  function stopWhisperEngine() {
    whisperGen += 1;
    const eng = whisper;
    whisper = null;
    if (!eng) return;
    if (eng.tick) clearInterval(eng.tick);
    if (eng.seg) eng.seg.send = false;
    try {
      if (eng.recorder && eng.recorder.state !== 'inactive') eng.recorder.stop();
    } catch { /* already stopped */ }
    try { eng.track.stop(); } catch { /* already ended */ }
  }

  async function transcribeSegment(blob: Blob, lang: string, startedAt: number) {
    if (blob.size < 2000) return;
    try {
      const form = new FormData();
      form.append('audio', blob);
      form.append('language', lang);
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      if (res.status === 501) {
        if (engine === 'whisper') {
          stopWhisperEngine();
          markUnavailable();
        }
        return;
      }
      if (!res.ok) return;
      const d = (await res.json()) as { text?: unknown; dropped?: unknown };
      const text = typeof d.text === 'string' ? d.text.trim() : '';
      if (!text || d.dropped === true) return;
      if (!captionsWanted()) return; // muted or left while it was in flight
      sttEverResult = true;
      if (looksLikeEcho(startedAt)) return;
      emitMine(newUid(), text, true, lang);
    } catch {
      /* network blip — the next segment carries on */
    }
  }

  function startWhisperEngine() {
    stopWhisperEngine();
    if (!captionsWanted()) return;
    const src0 = localStream?.getAudioTracks().find((t) => t.readyState === 'live');
    if (!src0 || typeof MediaRecorder === 'undefined') {
      markUnavailable();
      return;
    }
    const gen = ++whisperGen;
    const track = src0.clone();
    track.enabled = true;
    const eng: WhisperEngine = {
      gen, track, stream: new MediaStream([track]), mime: pickRecorderMime(), recorder: null, seg: null, tick: null,
    };
    whisper = eng;

    const begin = () => {
      if (gen !== whisperGen) return;
      let mr: MediaRecorder;
      try {
        mr = eng.mime ? new MediaRecorder(eng.stream, { mimeType: eng.mime }) : new MediaRecorder(eng.stream);
      } catch (err) {
        console.error('[GroupCall] MediaRecorder unavailable', err);
        stopWhisperEngine();
        markUnavailable();
        return;
      }
      const chunks: Blob[] = [];
      const s: WhisperSeg = { startedAt: Date.now(), hadVoice: false, voiceMs: 0, lastVoiceAt: 0, send: false };
      const lang = myLang;
      mr.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      mr.onstop = () => {
        if (s.send) {
          const type = mr.mimeType || eng.mime || 'audio/webm';
          void transcribeSegment(new Blob(chunks, { type }), lang, s.startedAt);
        }
        if (gen === whisperGen) begin();
      };
      try {
        mr.start();
      } catch (err) {
        console.error('[GroupCall] MediaRecorder start failed', err);
        stopWhisperEngine();
        markUnavailable();
        return;
      }
      eng.recorder = mr;
      eng.seg = s;
    };
    begin();

    eng.tick = setInterval(() => {
      if (gen !== whisperGen) return;
      const mr = eng.recorder;
      const s = eng.seg;
      if (!mr || !s || mr.state !== 'recording') return;
      const now = Date.now();
      const age = now - s.startedAt;
      let stop = false;
      if (meterLive()) {
        if (localVad.lastRms > localVad.threshold) {
          s.hadVoice = true;
          s.voiceMs += 100;
          s.lastVoiceAt = now;
        }
        if (s.hadVoice && now - s.lastVoiceAt > WHISPER_SILENCE_END_MS) {
          stop = true;
          s.send = s.voiceMs >= WHISPER_MIN_VOICE_MS;
        } else if (!s.hadVoice && age > WHISPER_IDLE_ROTATE_MS) {
          stop = true; // rotate silent audio away unsent
        } else if (age > WHISPER_MAX_SEGMENT_MS) {
          stop = true;
          s.send = s.voiceMs >= WHISPER_MIN_VOICE_MS;
        }
      } else if (age > WHISPER_BLIND_SEGMENT_MS) {
        // No working level meter — fixed windows; the server drops silence
        stop = true;
        s.send = true;
      }
      if (stop) {
        try { mr.stop(); } catch { /* already stopping */ }
      }
    }, 100);

    setStt('listening', 'whisper');
  }

  function switchToWhisper() {
    stopWebSpeech(true);
    engine = 'whisper';
    startWhisperEngine();
  }

  function markUnavailable() {
    stopWebSpeech(true);
    engine = 'none';
    setStt('unavailable', 'none');
  }

  // ═══ My captions: control ══════════════════════════════════════════════════

  function startCaptions() {
    if (!captionsWanted()) return;
    if (engine === 'none') {
      const hasSR = !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
      engine = hasSR ? 'webspeech' : canUseWhisper() ? 'whisper' : 'none';
    }
    if (engine === 'webspeech') startWebSpeech();
    else if (engine === 'whisper') startWhisperEngine();
    else setStt('unavailable', 'none');
  }

  function stopCaptions(flush: boolean) {
    stopWebSpeech(flush);
    stopWhisperEngine();
  }

  function restartCaptions() {
    if (!captionsWanted()) return;
    // The speech service never produced a single word this call — it doesn't
    // work on this device; our own transcription does.
    if (engine === 'webspeech' && !sttEverResult && canUseWhisper()) {
      switchToWhisper();
      return;
    }
    if (engine === 'none') {
      startCaptions();
      return;
    }
    sttRestarts = 0;
    stopCaptions(true);
    startCaptions();
  }

  function switchToBackupCaptions() {
    if (!captionsWanted() || !canUseWhisper()) return;
    switchToWhisper();
  }

  // ═══ Mesh messaging ════════════════════════════════════════════════════════

  function broadcast(msg: DataChannelMessage) {
    const encoded = JSON.stringify(msg);
    let sent = 0;
    dataConns.forEach((dc) => {
      if (!dc.open) return;
      try {
        dc.send(encoded);
        sent += 1;
      } catch { /* peer gone */ }
    });
    // Nobody connected yet (first seconds of the call) — retry a final once
    if (sent === 0 && msg.type === 'transcript' && msg.isFinal) {
      const room = roomCode;
      setTimeout(() => {
        if (left || roomCode !== room) return;
        dataConns.forEach((dc) => {
          if (!dc.open) return;
          try { dc.send(encoded); } catch { /* ignore */ }
        });
      }, 2000);
    }
  }

  function presenceMsg(): DataChannelMessage {
    return { type: 'presence', displayName, language: myLang, slotIndex: mySlot as SlotIndex };
  }

  function sendTo(dc: DataConnection, msg: DataChannelMessage) {
    if (!dc.open) return;
    try { dc.send(JSON.stringify(msg)); } catch { /* peer gone */ }
  }

  function onData(raw: string, fromSlot: number) {
    if (left) return;
    let msg: DataChannelMessage;
    try {
      msg = JSON.parse(raw) as DataChannelMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    lastSeen.set(fromSlot, Date.now());
    if (silentPoor.delete(fromSlot)) {
      dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: fromSlot, patch: { status: 'active' } });
    }
    switch (msg.type) {
      case 'bye':
        dropSlot(fromSlot);
        break;
      case 'transcript':
        handleTranscript(msg, fromSlot);
        break;
      case 'mute':
        dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: fromSlot, patch: { isMuted: msg.muted === true } });
        break;
      case 'camera':
        dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: fromSlot, patch: { isCameraOff: msg.off === true } });
        break;
      case 'presence': {
        // Also re-sent when someone switches language mid-call
        const name = cleanName(msg.displayName);
        const lang = cleanLang(msg.language, roster.get(fromSlot)?.language ?? 'en');
        const r = roster.get(fromSlot);
        if (r) {
          r.displayName = name;
          r.language = lang;
        }
        dispatch({ type: 'PARTICIPANT_UPSERT', slotIndex: fromSlot, patch: { displayName: name, language: lang } });
        break;
      }
      case 'ping': {
        const dc = dataConns.get(fromSlot);
        if (dc) sendTo(dc, { type: 'pong', ts: msg.ts });
        break;
      }
      default:
        break;
    }
  }

  // ═══ Mesh connections ══════════════════════════════════════════════════════
  // Every close/error handler checks it still OWNS the slot: a participant who
  // refreshes gets a new connection, and the old one's late 'close' used to
  // delete the new link and tile — they vanished and stopped receiving captions.

  function removeParticipant(slot: number) {
    const r = roster.get(slot);
    if (r?.connectTimer) clearTimeout(r.connectTimer);
    roster.delete(slot);
    lastSeen.delete(slot);
    silentPoor.delete(slot);
    teardownVAD(slot);
    finalizeLiveFrom(slot);
    // Seats are reused — the next person in this slot must not inherit the
    // departed speaker's lines as translation context
    speakerCtx.delete(slot);
    dispatch({ type: 'PARTICIPANT_REMOVE', slotIndex: slot });
  }

  // They left (bye) or went silent for good: close our side and clear the tile
  function dropSlot(slot: number) {
    const dc = dataConns.get(slot);
    const mc = mediaConns.get(slot);
    dataConns.delete(slot);
    mediaConns.delete(slot);
    try { dc?.close(); } catch { /* already closed */ }
    try { mc?.close(); } catch { /* already closed */ }
    removeParticipant(slot);
  }

  function wireDataConn(dc: DataConnection, slot: number) {
    dc.on('data', (data: unknown) => {
      onData(typeof data === 'string' ? data : JSON.stringify(data), slot);
    });
    dc.on('close', () => {
      if (dataConns.get(slot) !== dc) return;
      dataConns.delete(slot);
      const mc = mediaConns.get(slot);
      mediaConns.delete(slot);
      try { mc?.close(); } catch { /* already closed */ }
      removeParticipant(slot);
    });
  }

  function adoptDataConn(slot: number, dc: DataConnection) {
    const old = dataConns.get(slot);
    dataConns.set(slot, dc);
    if (old && old !== dc) {
      try { old.close(); } catch { /* already closed */ }
    }
    const r = roster.get(slot);
    if (r) {
      r.attempts = 0;
      if (r.connectTimer) {
        clearTimeout(r.connectTimer);
        r.connectTimer = null;
      }
    }
    lastSeen.set(slot, Date.now());
    silentPoor.delete(slot);
    dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: slot, patch: { status: 'active' } });
    sendTo(dc, presenceMsg());
  }

  function adoptMediaConn(slot: number, mc: MediaConnection) {
    const old = mediaConns.get(slot);
    mediaConns.set(slot, mc);
    if (old && old !== mc) {
      try { old.close(); } catch { /* already closed */ }
    }
    mc.on('stream', (remote: MediaStream) => {
      if (mediaConns.get(slot) !== mc) return;
      dispatch({
        type: 'PARTICIPANT_PATCH',
        slotIndex: slot,
        patch: { stream: remote, status: 'active', connectionQuality: 4 },
      });
      setupVAD(slot, remote);
      if (!vadTimer) startVAD();
    });
    mc.on('close', () => {
      if (mediaConns.get(slot) === mc) mediaConns.delete(slot);
    });
    mc.on('error', () => {
      if (mediaConns.get(slot) === mc) {
        dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: slot, patch: { connectionQuality: 1 } });
      }
    });
  }

  function startMediaCall(slot: number, remotePeerId: string) {
    if (!peer || peer.destroyed || !localStream || mediaConns.has(slot)) return;
    try {
      const mc = peer.call(remotePeerId, localStream, { metadata: { type: 'group', roomCode, slotIndex: mySlot } });
      adoptMediaConn(slot, mc);
    } catch (err) {
      console.error('[GroupCall] Media call failed', err);
    }
  }

  function scheduleAttempt(slot: number, delay: number) {
    const r = roster.get(slot);
    if (!r) return;
    if (r.connectTimer) clearTimeout(r.connectTimer);
    r.connectTimer = setTimeout(() => {
      r.connectTimer = null;
      attemptConnection(slot, r);
    }, delay);
  }

  function attemptConnection(slot: number, r: RosterEntry) {
    if (roster.get(slot) !== r || !peer || peer.destroyed || phase !== 'active') return;
    if (dataConns.get(slot)?.open) return;
    const attempt = r.attempts;
    r.attempts += 1;
    if (attempt >= MAX_CONNECT_ATTEMPTS) {
      // Say so (with Retry) instead of spinning "Connecting..." forever
      dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: slot, patch: { status: 'poor', connectionQuality: 1 } });
      return;
    }
    const backoff = Math.min(2000 * (attempt + 1), 8000);
    let dc: DataConnection;
    try {
      dc = peer.connect(r.peerId, {
        reliable: true,
        metadata: { type: 'group', roomCode, slotIndex: mySlot, displayName, language: myLang },
      });
    } catch (err) {
      console.error('[GroupCall] connect failed', err);
      scheduleAttempt(slot, backoff);
      return;
    }
    let opened = false;
    const timeout = setTimeout(() => {
      if (opened) return;
      try { dc.close(); } catch { /* ignore */ }
      if (phase === 'active' && roster.get(slot) === r) scheduleAttempt(slot, backoff);
    }, 5000);
    dc.on('open', () => {
      opened = true;
      clearTimeout(timeout);
      if (roster.get(slot) !== r) {
        try { dc.close(); } catch { /* ignore */ }
        return;
      }
      adoptDataConn(slot, dc);
      startMediaCall(slot, r.peerId); // data channel proved the peer is reachable
    });
    dc.on('error', () => {
      clearTimeout(timeout);
      if (!opened && phase === 'active' && roster.get(slot) === r) scheduleAttempt(slot, backoff);
    });
    wireDataConn(dc, slot);
  }

  function connectToPeer(remotePeerId: string, slot: number, info: { displayName?: unknown; language?: unknown; deviceId?: unknown }) {
    if (!peer || peer.destroyed || slot === mySlot) return;
    if (dataConns.get(slot)?.open) return;
    const prev = roster.get(slot);
    if (prev?.connectTimer) clearTimeout(prev.connectTimer);
    const r: RosterEntry = {
      peerId: remotePeerId,
      displayName: cleanName(info.displayName),
      language: cleanLang(info.language),
      deviceId: typeof info.deviceId === 'string' ? info.deviceId : '',
      attempts: 0,
      connectTimer: null,
    };
    roster.set(slot, r);
    dispatch({
      type: 'PARTICIPANT_UPSERT',
      slotIndex: slot,
      patch: { status: 'connecting', displayName: r.displayName, language: r.language, peerId: remotePeerId, deviceId: r.deviceId },
    });
    // Give a just-joined peer a moment to register with the signaling server
    scheduleAttempt(slot, 1500);
  }

  function retryConnection(slot: number) {
    const r = roster.get(slot);
    if (!r || phase !== 'active') return;
    // A link the heartbeat flagged may still report "open" — replace it.
    // Unregister first so its 'close' doesn't remove the tile.
    const dc = dataConns.get(slot);
    const mc = mediaConns.get(slot);
    dataConns.delete(slot);
    mediaConns.delete(slot);
    try { dc?.close(); } catch { /* already closed */ }
    try { mc?.close(); } catch { /* already closed */ }
    silentPoor.delete(slot);
    lastSeen.set(slot, Date.now());
    r.attempts = 0;
    dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: slot, patch: { status: 'connecting', connectionQuality: 2 } });
    scheduleAttempt(slot, 0);
  }

  function readMeta(raw: unknown): { slot: number; name: string; lang: string } | null {
    const meta = (raw ?? {}) as { type?: unknown; roomCode?: unknown; slotIndex?: unknown; displayName?: unknown; language?: unknown };
    if (meta.type !== 'group' || meta.roomCode !== roomCode) return null;
    const slot = Number(meta.slotIndex);
    if (!Number.isInteger(slot) || slot < 0 || slot > 3 || slot === mySlot) return null;
    return { slot, name: cleanName(meta.displayName), lang: cleanLang(meta.language) };
  }

  function wireIncoming(p: Peer) {
    p.on('connection', (dc: DataConnection) => {
      const meta = readMeta(dc.metadata);
      if (!meta) return;
      const { slot, name, lang } = meta;
      const prev = roster.get(slot);
      if (prev?.connectTimer) clearTimeout(prev.connectTimer);
      roster.set(slot, { peerId: dc.peer, displayName: name, language: lang, deviceId: '', attempts: 0, connectTimer: null });
      // Register the newcomer — earlier participants must see late joiners
      dispatch({
        type: 'PARTICIPANT_UPSERT',
        slotIndex: slot,
        patch: { displayName: name, language: lang, peerId: dc.peer, status: dataConns.get(slot)?.open ? 'active' : 'connecting' },
      });
      dc.on('open', () => adoptDataConn(slot, dc));
      wireDataConn(dc, slot);
    });

    p.on('call', (mc: MediaConnection) => {
      const meta = readMeta({ ...(mc.metadata ?? {}), displayName: 'x', language: 'en' });
      if (!meta) return;
      try {
        mc.answer(localStream ?? undefined);
      } catch (err) {
        console.error('[GroupCall] answer failed', err);
        return;
      }
      adoptMediaConn(meta.slot, mc);
    });

    // Lost the signaling socket (network blip / phone slept): existing links
    // keep working, but nobody new can reach us until we re-register.
    p.on('disconnected', () => {
      if (left || phase !== 'active' || p.destroyed || peerReconnects >= 6) return;
      const delay = Math.min(1000 * Math.pow(2, peerReconnects), 15000);
      peerReconnects += 1;
      setTimeout(() => {
        if (left || p.destroyed || !p.disconnected) return;
        try { p.reconnect(); } catch (err) { console.error('[GroupCall] Signaling reconnect failed', err); }
      }, delay);
    });
    p.on('open', () => {
      peerReconnects = 0;
    });
    p.on('error', (err: unknown) => {
      // peer-unavailable etc. — per-connection retries handle these
      if (phase === 'active') console.error('[GroupCall] Peer error', err);
    });
  }

  // ═══ Housekeeping ══════════════════════════════════════════════════════════

  // Heartbeat: every peer answers pings (pre-heartbeat clients too), so a
  // silent link means a phone that died / lost network without a goodbye.
  function heartbeat(now: number) {
    sweepTicks += 1;
    if (sweepTicks % HEARTBEAT_EVERY_TICKS === 0) broadcast({ type: 'ping', ts: now });
    const gone: number[] = [];
    dataConns.forEach((dc, slot) => {
      if (!dc.open) return;
      const silence = now - (lastSeen.get(slot) ?? now);
      if (silence > PEER_SILENT_DROP_MS) {
        gone.push(slot);
      } else if (silence > PEER_SILENT_POOR_MS && !silentPoor.has(slot)) {
        silentPoor.add(slot);
        dispatch({ type: 'PARTICIPANT_PATCH', slotIndex: slot, patch: { status: 'poor' } });
      }
    });
    gone.forEach(dropSlot);
  }

  function sweep() {
    const now = Date.now();
    heartbeat(now);
    const stale: string[] = [];
    subs.forEach((s) => {
      if (!s.isFinal && now - s.updatedAt > STALE_LIVE_MS) stale.push(s.id);
    });
    stale.forEach(finalizeSub);
    // The speech service exists but is deaf on this device (it never heard a
    // word while my own mic clearly heard me speak) → use our transcription.
    if (
      engine === 'webspeech' && !sttEverResult && captionsWanted() &&
      localVad.verified && localVad.voiceMsNoResult >= DEAF_STT_VOICE_MS && canUseWhisper()
    ) {
      switchToWhisper();
    }
  }

  function releaseSlot() {
    if (mySlot < 0 || !roomCode) return;
    try {
      void fetch('/api/group/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, slotIndex: mySlot, deviceId, peerId: myPeerId }),
        keepalive: true, // survives page close
      }).catch(() => {});
    } catch { /* ignore */ }
  }

  // Mic, camera, captions, meters and timers — stop immediately
  function teardownLocal() {
    stopCaptions(false);
    stopLocalVAD();
    if (vadTimer) {
      clearInterval(vadTimer);
      vadTimer = null;
    }
    Array.from(vads.keys()).forEach(teardownVAD);
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    roster.forEach((r) => { if (r.connectTimer) clearTimeout(r.connectTimer); });
    Array.from(liveXlate.keys()).forEach(cancelLiveXlate);
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    try { void audioCtx?.close(); } catch { /* ignore */ }
    audioCtx = null;
  }

  function teardownConnections() {
    dataConns.forEach((dc) => { try { dc.close(); } catch { /* ignore */ } });
    dataConns.clear();
    mediaConns.forEach((mc) => { try { mc.close(); } catch { /* ignore */ } });
    mediaConns.clear();
    try { peer?.destroy(); } catch { /* ignore */ }
    peer = null;
  }

  // ═══ Public API ════════════════════════════════════════════════════════════

  async function joinRoom(code: string, opts: JoinOptions) {
    if (phase === 'joining' || phase === 'active') return;
    left = false;
    roomCode = code.toUpperCase();
    callType = opts.callType;
    displayName = opts.displayName;
    deviceId = opts.deviceId;
    myLang = cleanLang(opts.language);
    engine = 'none';
    sttEverResult = false;
    dispatch({ type: 'SET_LANGUAGE', language: myLang });
    setPhase('joining');

    try {
      let stream: MediaStream;
      if (opts.existingStream && opts.existingStream.getTracks().some((t) => t.readyState === 'live')) {
        stream = opts.existingStream;
      } else {
        stream = await navigator.mediaDevices.getUserMedia(
          callType === 'video' ? GROUP_VIDEO_CONSTRAINTS : GROUP_AUDIO_CONSTRAINTS,
        );
      }
      if (left) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStream = stream;
      dispatch({ type: 'SET_LOCAL_STREAM', stream });

      // Unique per session so a quick rejoin never collides with our own
      // not-yet-expired signaling registration ("ID is taken" split-brain).
      const sessionTag = newUid().slice(-8).toLowerCase();
      const slotRes = await fetch('/api/group/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, deviceId, displayName, language: myLang, sessionTag }),
      });
      if (!slotRes.ok) {
        const err = (await slotRes.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof err.error === 'string' ? err.error : 'Room is full or unavailable');
      }
      const slotData = (await slotRes.json()) as { slotIndex?: unknown; peerId?: unknown; participants?: unknown };
      const slot = Number(slotData.slotIndex);
      if (!Number.isInteger(slot) || slot < 0 || slot > 3) throw new Error('Could not get a seat in this call');
      mySlot = slot;
      myPeerId = typeof slotData.peerId === 'string' && slotData.peerId
        ? slotData.peerId
        : `entrevoz-group-${roomCode}-slot${slot}`;
      dispatch({ type: 'SET_SLOT', slotIndex: slot as SlotIndex });
      const others = (Array.isArray(slotData.participants) ? slotData.participants : []) as ParticipantSlot[];

      // TURN servers for NAT traversal (critical on mobile networks)
      let iceServers: RTCIceServer[] = STUN_SERVERS;
      try {
        const turnRes = await fetch('/api/turn');
        if (turnRes.ok) {
          const turnData = (await turnRes.json()) as { iceServers?: unknown };
          if (Array.isArray(turnData.iceServers) && turnData.iceServers.length) {
            iceServers = turnData.iceServers as RTCIceServer[];
          }
        }
      } catch {
        /* STUN only */
      }

      let connected: Peer | null = null;
      for (const server of PEERJS_SERVERS) {
        if (left) break;
        let attemptPeer: Peer | null = null;
        try {
          const candidate = new Peer(myPeerId, {
            host: server.host,
            port: server.port,
            secure: server.secure,
            path: server.path,
            config: { iceServers },
          });
          attemptPeer = candidate;
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('PeerJS timeout')), 8000);
            candidate.once('open', () => { clearTimeout(timer); resolve(); });
            candidate.once('error', (err: unknown) => { clearTimeout(timer); reject(err); });
          });
          connected = candidate;
          break;
        } catch (err) {
          console.error('[GroupCall] Signaling server failed', server.host, err);
          // Destroy the failed attempt so it can't register late on this server
          try { attemptPeer?.destroy(); } catch { /* ignore */ }
        }
      }
      if (left) {
        try { connected?.destroy(); } catch { /* ignore */ }
        return;
      }
      if (!connected) throw new Error('Could not connect to the call server. Check your internet and try again.');
      peer = connected;
      wireIncoming(connected);
      setPhase('active');

      others.forEach((p) => {
        if (!p || typeof p.peerId !== 'string') return;
        const s = Number(p.slotIndex);
        if (Number.isInteger(s) && s >= 0 && s <= 3 && s !== slot) connectToPeer(p.peerId, s, p);
      });

      startLocalVAD(stream);
      startVAD();
      if (sweepTimer) clearInterval(sweepTimer);
      sweepTimer = setInterval(sweep, SWEEP_INTERVAL);
      startCaptions();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : 'Failed to join';
      const denied = name === 'NotAllowedError' || /permission|denied|not allowed/i.test(message);
      console.error('[GroupCall] Join failed', err);
      releaseSlot();
      teardownLocal();
      teardownConnections();
      mySlot = -1;
      setPhase('error', denied ? MIC_DENIED_COPY : message);
    }
  }

  function leaveRoom() {
    if (left) return;
    const wasInCall = phase === 'active' || phase === 'joining';
    // Goodbye first, so everyone's tile for us disappears at once
    if (phase === 'active') broadcast({ type: 'bye' });
    left = true;
    releaseSlot();
    teardownLocal();
    // Give the goodbye a moment to flush before closing the links (a page
    // being closed tears them down itself)
    setTimeout(teardownConnections, 300);
    if (wasInCall) setPhase('ended');
  }

  function toggleMute() {
    if (phase !== 'active') return;
    muted = !muted;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    if (localVad.track) localVad.track.enabled = !muted;
    dispatch({ type: 'SET_MUTED', muted });
    broadcast({ type: 'mute', muted });
    if (muted) {
      stopCaptions(true); // words said before muting still finish their line
      setStt('muted');
    } else {
      startCaptions();
    }
  }

  function toggleCamera() {
    if (phase !== 'active') return;
    cameraOff = !cameraOff;
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    dispatch({ type: 'SET_CAMERA_OFF', off: cameraOff });
    broadcast({ type: 'camera', off: cameraOff });
  }

  function setMyLanguage(raw: string) {
    const lang = cleanLang(raw, myLang);
    if (lang === myLang) return;
    myLang = lang;
    dispatch({ type: 'SET_LANGUAGE', language: lang });
    if (phase !== 'active') return;
    broadcast(presenceMsg()); // everyone's roster + translation banner update now
    // Restart captions in the new language — the old recognizer is invalidated
    // (never left running); Whisper starts a fresh segment so no audio is sent
    // under the old language.
    if (captionsWanted() && engine === 'webspeech') startWebSpeech();
    else if (captionsWanted() && engine === 'whisper') startWhisperEngine();
    retranslateRecent();
  }

  function onVisibility(hidden: boolean) {
    if (hidden) {
      wasBackgrounded = true;
      localVad.verified = false; // re-prove the meter before it may gate anything
      if (vadTimer) {
        clearInterval(vadTimer);
        vadTimer = null;
      }
      return;
    }
    if (phase !== 'active' || left) return;
    // WebKit suspends the AudioContext in background and does not auto-resume
    audioCtx?.resume().catch(() => {});
    startVAD();
    // iOS kills SpeechRecognition (and can stall MediaRecorder) in background:
    // rebuild captions fresh instead of leaving them silently dead.
    if (captionsWanted()) {
      stopCaptions(true);
      startCaptions();
    }
    setTimeout(() => { wasBackgrounded = false; }, 3000);
  }

  return {
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleCamera,
    setMyLanguage,
    primeAudio,
    retryTranslation,
    restartCaptions,
    switchToBackupCaptions,
    retryConnection,
    onVisibility,
    isInCall: () => phase === 'active' || phase === 'joining',
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGroupCall(): UseGroupCallReturn {
  const [state, dispatch] = useReducer(reducer, INIT);
  const engineRef = useRef<GroupEngine | null>(null);
  if (!engineRef.current) engineRef.current = createGroupEngine(dispatch);
  const engine = engineRef.current;

  useEffect(() => {
    const onVisibility = () => engine.onVisibility(document.hidden);
    // pagehide: iOS Safari never fires beforeunload on close/navigate-away
    const onPageHide = () => engine.leaveRoom();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      // Only a real call is left — a lobby unmount (incl. StrictMode's dev
      // double-mount) must not flip the page to "Call ended".
      if (engine.isInCall()) engine.leaveRoom();
    };
  }, [engine]);

  return {
    phase: state.phase,
    error: state.error,
    mySlotIndex: state.mySlotIndex,
    myLanguage: state.myLanguage,
    isMuted: state.isMuted,
    isCameraOff: state.isCameraOff,
    localStream: state.localStream,
    participants: state.participants,
    subtitles: state.subtitles,
    participantCount:
      state.participants.filter((p, i) => p !== null && i !== state.mySlotIndex).length +
      (state.mySlotIndex !== null ? 1 : 0),
    sttState: state.sttState,
    sttEngine: state.sttEngine,
    localSpeaking: state.localSpeaking,
    joinRoom: engine.joinRoom,
    leaveRoom: engine.leaveRoom,
    toggleMute: engine.toggleMute,
    toggleCamera: engine.toggleCamera,
    setMyLanguage: engine.setMyLanguage,
    primeAudio: engine.primeAudio,
    retryTranslation: engine.retryTranslation,
    restartCaptions: engine.restartCaptions,
    switchToBackupCaptions: engine.switchToBackupCaptions,
    retryConnection: engine.retryConnection,
  };
}
