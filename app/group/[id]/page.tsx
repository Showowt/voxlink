'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useGroupCall } from '@/hooks/useGroupCall';
import { getDeviceId } from '@/app/lib/language-os/device-id';
import type { Participant, SubtitleEntry, SttEngine, SttState } from '@/app/lib/group-call/types';
import LearningMode, { useLearningMode, TappableCaption, LearningInsightCard } from '@/app/components/LearningMode';
import LanguagePick from '@/app/components/LanguagePick';
// Master list — a hardcoded subset here silently discarded the language
// picked on the landing page for the other languages.
import { LANGUAGES, LANGUAGE_MAP, getLanguage } from '@/app/lib/languages';
import type { Language } from '@/app/lib/languages';
import { ensureAIConsent } from '@/app/lib/ai-consent';
import { SPEECH_AUDIO } from '@/app/lib/audio-constraints';

// ─── UI copy (EN / ES — follows the language the user picks) ─────────────────

const UI = {
  en: {
    groupCall: 'Group Call', videoAudio: 'Video + Audio', audioOnly: 'Audio only',
    yourName: 'Your name', namePlaceholder: 'Enter your name…', iSpeak: 'I speak',
    iSpeakHint: 'You speak this language — everyone else’s words are translated into it for you.',
    join: 'Join call', joining: 'Joining…', enterName: 'Enter your name to join',
    inviteOthers: 'Invite others to this call', copyLink: 'Copy link', copied: 'Copied!',
    noApp: 'No app needed for guests · Works in any browser',
    cameraDenied: 'Camera access denied', cameraDeniedHint: 'Check your settings and refresh',
    startingCamera: 'Starting camera…', cameraReady: 'Camera ready',
    person: 'person', people: 'people', invite: 'Invite', youSpeak: 'You speak',
    translatedFor: 'Translated into {lang} for you',
    sameLanguage: 'Everyone speaks {lang} — captions only',
    aloneHint: 'Waiting for others to join…',
    you: 'You', speaking: 'speaking…', translating: 'translating…', failed: 'Couldn’t translate',
    retry: 'Retry', emptyFeed: 'Start talking — everyone reads your words in their own language.',
    newMessages: 'New messages', connecting: 'Connecting…', cantReach: 'Can’t reach',
    waiting: 'Waiting…', muted: 'Muted', listening: 'Listening', backupMode: 'backup mode',
    startingCaptions: 'Starting captions…', recovering: 'Reconnecting captions…',
    mutedStatus: 'You’re muted — others can’t hear or read you',
    blocked: 'Microphone blocked — others can’t read you',
    unavailable: 'Voice captions aren’t available on this device — others can still hear you',
    restartCaptions: 'Restart captions', useBackup: 'Use backup', somethingWrong: 'Something went wrong',
    back: 'Back', callEnded: 'Call ended', thanks: 'Thanks for using Entrevoz', goHome: 'Go home',
    leave: 'Leave call', mute: 'Mute', unmute: 'Unmute', cameraOff: 'Turn off camera',
    cameraOn: 'Turn on camera', yourLanguage: 'Your language', conversation: 'Conversation',
    shareText: 'Join my translated group call — speak your language, everyone understands!',
    captions: 'Captions',
  },
  es: {
    groupCall: 'Llamada grupal', videoAudio: 'Video + audio', audioOnly: 'Solo audio',
    yourName: 'Tu nombre', namePlaceholder: 'Escribe tu nombre…', iSpeak: 'Hablo',
    iSpeakHint: 'Hablas este idioma y las palabras de los demás se te traducen a él.',
    join: 'Unirme', joining: 'Entrando…', enterName: 'Escribe tu nombre para entrar',
    inviteOthers: 'Invita a otros a esta llamada', copyLink: 'Copiar enlace', copied: '¡Copiado!',
    noApp: 'Los invitados no necesitan app · Funciona en cualquier navegador',
    cameraDenied: 'Acceso a la cámara denegado', cameraDeniedHint: 'Revisa los permisos y recarga',
    startingCamera: 'Iniciando cámara…', cameraReady: 'Cámara lista',
    person: 'persona', people: 'personas', invite: 'Invitar', youSpeak: 'Hablas',
    translatedFor: 'Todos se te traducen al {lang}',
    sameLanguage: 'Todos hablan {lang} — solo subtítulos',
    aloneHint: 'Esperando a que se unan otros…',
    you: 'Tú', speaking: 'hablando…', translating: 'traduciendo…', failed: 'No se pudo traducir',
    retry: 'Reintentar', emptyFeed: 'Empieza a hablar: cada uno lee tus palabras en su idioma.',
    newMessages: 'Mensajes nuevos', connecting: 'Conectando…', cantReach: 'Sin conexión',
    waiting: 'Esperando…', muted: 'Silenciado', listening: 'Escuchando', backupMode: 'modo respaldo',
    startingCaptions: 'Iniciando subtítulos…', recovering: 'Reconectando subtítulos…',
    mutedStatus: 'Estás silenciado: nadie te oye ni te lee',
    blocked: 'Micrófono bloqueado: nadie te puede leer',
    unavailable: 'Los subtítulos de voz no están disponibles en este dispositivo; igual te escuchan',
    restartCaptions: 'Reiniciar subtítulos', useBackup: 'Usar respaldo', somethingWrong: 'Algo salió mal',
    back: 'Volver', callEnded: 'Llamada terminada', thanks: 'Gracias por usar Entrevoz', goHome: 'Ir al inicio',
    leave: 'Salir de la llamada', mute: 'Silenciar', unmute: 'Activar micrófono', cameraOff: 'Apagar cámara',
    cameraOn: 'Encender cámara', yourLanguage: 'Tu idioma', conversation: 'Conversación',
    shareText: '¡Únete a mi llamada grupal traducida: habla tu idioma y todos te entienden!',
    captions: 'Subtítulos',
  },
} as const;

type UiKey = keyof typeof UI.en;

function t(lang: string, key: UiKey): string {
  return (lang.toLowerCase().startsWith('es') ? UI.es : UI.en)[key];
}

// Distinct per-seat colors so a line in the feed maps to a tile at a glance
const SLOT_COLORS = ['#00C896', '#8B6CFF', '#F5A524', '#FF5C8A'];

function slotColor(slot: number | null | undefined): string {
  return SLOT_COLORS[Math.abs(slot ?? 0) % SLOT_COLORS.length];
}

// Device preference: the user's saved app language, else the first browser
// language we support (all 31, not a hardcoded subset), else English.
function preferredLanguage(): string {
  try {
    const saved = localStorage.getItem('entrevoz_lang') ?? '';
    if (LANGUAGE_MAP[saved]) return saved;
  } catch {
    /* storage blocked */
  }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of list) {
    const base = (raw || '').toLowerCase().split('-')[0];
    const code = base === 'fil' ? 'tl' : base === 'nb' || base === 'nn' ? 'no' : base === 'iw' ? 'he' : base === 'in' ? 'id' : base;
    if (LANGUAGE_MAP[code]) return code;
  }
  return 'en';
}

// ─── Small presentational pieces ─────────────────────────────────────────────

function QualityBars({ q }: { q: 1 | 2 | 3 | 4 }) {
  const color = q >= 3 ? '#00C896' : q === 2 ? '#EF9F27' : '#E24B4A';
  return (
    <div className="flex items-end gap-0.5 h-3" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: `${i * 25}%`, background: i <= q ? color : 'rgba(255,255,255,0.15)', width: 3, borderRadius: 1 }} />
      ))}
    </div>
  );
}

function LiveDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 align-middle" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

function MicOffIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  );
}

// Language picker: styled pill with the native <select> layered on top
// (wheel picker on iOS, full keyboard/screen-reader support everywhere).
function LangSelect({ value, onChange, label, compact = false }: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  compact?: boolean;
}) {
  const l = getLanguage(value);
  return (
    <label
      className={`relative inline-flex items-center gap-1.5 rounded-full border border-[#00C896]/40 bg-[#00C896]/10 text-white cursor-pointer flex-shrink-0 ${
        compact ? 'h-12 px-3 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <span className="text-base leading-none">{l.flag}</span>
      <span className="font-medium">{compact ? l.code.toUpperCase() : l.nativeName}</span>
      <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        data-testid={compact ? 'lang-select-compact' : 'lang-select'}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {LANGUAGES.map((x) => (
          <option key={x.code} value={x.code}>
            {x.flag} {x.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center min-h-[96px]">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center border-2"
        style={{ background: `${color}22`, borderColor: `${color}66` }}
      >
        <span className="font-medium text-lg" style={{ color }}>
          {(name.trim().charAt(0) || '?').toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function TileLabel({ name, lang, color, muted, extra }: {
  name: string;
  lang: Language;
  color: string;
  muted: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-white text-xs font-medium truncate">{name}</span>
          {muted && <MicOffIcon />}
        </div>
        {extra}
      </div>
      <div className="text-[10px] text-white/65 mt-0.5 truncate">
        {lang.flag} {lang.nativeName}
      </div>
    </div>
  );
}

const MyTile = memo(function MyTile({ stream, showVideo, label, name, lang, color, speaking, muted, videoRef }: {
  stream: MediaStream | null;
  showVideo: boolean;
  label: string;
  name: string;
  lang: string;
  color: string;
  speaking: boolean;
  muted: boolean;
  videoRef: (el: HTMLVideoElement | null) => void;
}) {
  const vRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = vRef.current;
    if (el && stream && el.srcObject !== stream) el.srcObject = stream;
  }, [stream, showVideo]);
  return (
    <div
      className="relative rounded-xl overflow-hidden bg-[#111] transition-shadow duration-200"
      style={{ boxShadow: speaking ? `0 0 0 2px ${color}, 0 0 18px ${color}66` : 'none' }}
      data-tile="me"
      data-speaking={speaking ? 'true' : 'false'}
    >
      {showVideo ? (
        <video
          ref={(el) => { vRef.current = el; videoRef(el); }}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
      ) : (
        <Avatar name={name} color={color} />
      )}
      <TileLabel name={label} lang={getLanguage(lang)} color={color} muted={muted} />
    </div>
  );
});

const RemoteTile = memo(function RemoteTile({ p, callType, color, speaking, uiLang, onRetry, videoRef, audioRef }: {
  p: Participant;
  callType: 'video' | 'audio';
  color: string;
  speaking: boolean;
  uiLang: string;
  onRetry: (slot: number) => void;
  videoRef: (el: HTMLVideoElement | null) => void;
  audioRef: (el: HTMLAudioElement | null) => void;
}) {
  const vRef = useRef<HTMLVideoElement | null>(null);
  const aRef = useRef<HTMLAudioElement | null>(null);
  const showVideo = callType === 'video' && !p.isCameraOff && !!p.stream;
  useEffect(() => {
    const el = vRef.current;
    if (el && p.stream && el.srcObject !== p.stream) el.srcObject = p.stream;
  }, [p.stream, showVideo]);
  // Sound comes from this always-mounted <audio>: the <video> unmounts when
  // the camera is off / audio-only, which used to silence that person.
  useEffect(() => {
    const el = aRef.current;
    if (el && p.stream && el.srcObject !== p.stream) {
      el.srcObject = p.stream;
      el.play().catch(() => {});
    }
  }, [p.stream]);
  return (
    <div
      className="relative rounded-xl overflow-hidden bg-[#111] transition-shadow duration-200"
      style={{ boxShadow: speaking ? `0 0 0 2px ${color}, 0 0 18px ${color}66` : 'none' }}
      data-tile-slot={p.slotIndex}
      data-speaking={speaking ? 'true' : 'false'}
    >
      <audio ref={(el) => { aRef.current = el; audioRef(el); }} autoPlay playsInline className="hidden" />
      {showVideo ? (
        <video
          ref={(el) => { vRef.current = el; videoRef(el); }}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <Avatar name={p.displayName} color={color} />
      )}
      {p.status === 'connecting' && !p.stream && (
        <div className="absolute top-2 inset-x-0 flex justify-center">
          <span className="text-[11px] text-white/70 bg-black/60 px-2 py-0.5 rounded-full">{t(uiLang, 'connecting')}</span>
        </div>
      )}
      {p.status === 'poor' && (
        <div className="absolute top-2 inset-x-0 flex justify-center">
          <button
            onClick={() => onRetry(p.slotIndex)}
            className="text-[11px] text-white bg-red-500/80 px-2.5 py-1 rounded-full"
          >
            {t(uiLang, 'cantReach')} · {t(uiLang, 'retry')}
          </button>
        </div>
      )}
      <TileLabel
        name={p.displayName}
        lang={getLanguage(p.language)}
        color={color}
        muted={p.isMuted}
        extra={<QualityBars q={p.connectionQuality} />}
      />
    </div>
  );
});

function EmptyTile({ label, inviteLabel, onInvite }: { label: string; inviteLabel: string; onInvite: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 border-dashed bg-white/[0.02] flex flex-col items-center justify-center gap-2 min-h-[96px]">
      <span className="text-white/25 text-xs">{label}</span>
      <button onClick={onInvite} className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-white/70 hover:bg-white/15">
        + {inviteLabel}
      </button>
    </div>
  );
}

const FeedItem = memo(function FeedItem({ sub, color, uiLang, learning, onRetry, onWordSaved }: {
  sub: SubtitleEntry;
  color: string;
  uiLang: string;
  learning: boolean;
  onRetry: (id: string) => void;
  onWordSaved: (original: string, translation: string, lang: string) => void;
}) {
  const src = getLanguage(sub.speakerLanguage);
  const caption = (text: string, from: string, to: string) =>
    learning ? (
      <TappableCaption text={text} sourceLang={from} targetLang={to} onWordSaved={onWordSaved} enabled />
    ) : (
      text
    );

  if (sub.isMe) {
    return (
      <div className="flex justify-end" data-feed-item data-me="true" data-status={sub.status} data-final={sub.isFinal ? 'true' : 'false'}>
        <div className="max-w-[85%]">
          <div className="text-[10px] text-right mb-0.5 font-semibold" style={{ color }}>
            {t(uiLang, 'you')} {src.flag}
            {!sub.isFinal && <LiveDots />}
          </div>
          <div
            className={`rounded-2xl rounded-tr-md px-3 py-2 text-sm leading-snug ${
              sub.isFinal ? 'bg-white/10 text-white' : 'bg-white/[0.05] text-white/60 italic'
            }`}
          >
            {sub.original}
          </div>
        </div>
      </div>
    );
  }

  const target = sub.targetLanguage;
  let main: ReactNode;
  let showOriginal = true;
  let mainClass = 'text-white text-[15px] leading-snug font-medium';
  if (sub.status === 'same') {
    main = caption(sub.original, sub.speakerLanguage, target);
    showOriginal = false;
  } else if (sub.status === 'done' && sub.translated) {
    main = caption(sub.translated, target, sub.speakerLanguage);
  } else if (sub.status === 'failed') {
    main = sub.original;
    showOriginal = false;
  } else if (sub.liveTranslated) {
    // live / translating with a provisional translation
    main = sub.liveTranslated;
    mainClass = 'text-white/75 text-[15px] leading-snug italic';
  } else {
    main = sub.original;
    showOriginal = false;
    mainClass = 'text-white/60 text-[15px] leading-snug italic';
  }

  return (
    <div
      className="flex"
      data-feed-item
      data-me="false"
      data-speaker={sub.speakerName}
      data-status={sub.status}
      data-target={target}
      data-final={sub.isFinal ? 'true' : 'false'}
    >
      <div className="max-w-[90%]">
        <div className="text-[10px] mb-0.5 flex items-center gap-1 text-white/45">
          <span className="font-semibold" style={{ color }}>{sub.speakerName}</span>
          <span>{src.flag}</span>
          {sub.status === 'live' && <span>{t(uiLang, 'speaking')}<LiveDots /></span>}
          {sub.status === 'translating' && <span className="italic">{t(uiLang, 'translating')}</span>}
        </div>
        <div className="rounded-2xl rounded-tl-md px-3 py-2 bg-white/[0.06] border" style={{ borderColor: `${color}40` }}>
          <div className={mainClass} data-main-text>{main}</div>
          {showOriginal && (
            <div className="mt-1 text-[11px] text-white/45 leading-snug" data-original-text>
              {src.flag} {caption(sub.original, sub.speakerLanguage, target)}
            </div>
          )}
          {sub.status === 'failed' && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              <span className="text-amber-300/90">⚠ {t(uiLang, 'failed')}</span>
              <button onClick={() => onRetry(sub.id)} className="px-2 py-0.5 rounded-full bg-white/10 text-white hover:bg-white/15">
                {t(uiLang, 'retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function SttStatusBar({ state, engine, lang, speaking, uiLang, onRestart, onBackup }: {
  state: SttState;
  engine: SttEngine;
  lang: string;
  speaking: boolean;
  uiLang: string;
  onRestart: () => void;
  onBackup: () => void;
}) {
  if (state === 'idle') return null;
  const l = getLanguage(lang);
  let dot = 'bg-[#00C896]';
  let text = '';
  let action: ReactNode = null;
  if (state === 'listening') {
    text = `${t(uiLang, 'listening')} · ${l.flag} ${l.nativeName}${engine === 'whisper' ? ` · ${t(uiLang, 'backupMode')}` : ''}`;
    action = (
      <button
        onClick={onRestart}
        className="w-6 h-6 rounded-full bg-white/10 text-white/70 flex items-center justify-center"
        title={t(uiLang, 'restartCaptions')}
        aria-label={t(uiLang, 'restartCaptions')}
      >
        ↻
      </button>
    );
  } else if (state === 'starting') {
    dot = 'bg-white/40';
    text = t(uiLang, 'startingCaptions');
  } else if (state === 'recovering') {
    dot = 'bg-amber-400';
    text = t(uiLang, 'recovering');
    if (engine === 'webspeech') {
      action = (
        <button onClick={onBackup} className="px-2 py-0.5 rounded-full bg-white/10 text-white">
          {t(uiLang, 'useBackup')}
        </button>
      );
    }
  } else if (state === 'muted') {
    dot = 'bg-red-500';
    text = t(uiLang, 'mutedStatus');
  } else if (state === 'blocked') {
    dot = 'bg-red-500';
    text = t(uiLang, 'blocked');
    action = (
      <button onClick={onRestart} className="px-2 py-0.5 rounded-full bg-white/10 text-white">
        {t(uiLang, 'retry')}
      </button>
    );
  } else if (state === 'unavailable') {
    dot = 'bg-white/30';
    text = t(uiLang, 'unavailable');
  }
  return (
    <div
      className="flex items-center justify-center gap-2 px-4 pt-2 text-[11px] text-white/60 min-h-[28px]"
      data-stt-state={state}
      data-stt-engine={engine}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-transform ${dot} ${speaking && state === 'listening' ? 'scale-150 animate-pulse' : ''}`} />
      <span className="truncate">{text}</span>
      {action}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupCallPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomCode = typeof params.id === 'string' ? params.id.toUpperCase() : '';
  const callType = searchParams.get('type') === 'audio' ? ('audio' as const) : ('video' as const);
  // Only the creator's own navigation from /group carries ?lang= (their pick).
  // Shared invite links never do — guests choose in this lobby.
  const urlLangRaw = searchParams.get('lang') ?? '';
  const urlLang = LANGUAGE_MAP[urlLangRaw] ? urlLangRaw : '';

  const gc = useGroupCall();
  const learning = useLearningMode();

  // The initial language must match on server and client (URL or 'en'); the
  // device default is applied after mount. Computing it during render made the
  // server paint "English" selected while the phone's state said Spanish, and
  // React kept the wrong highlight — people joined in a language they never chose.
  const [displayName, setDisplayName] = useState('');
  const [selectedLang, setSelectedLang] = useState(urlLang || 'en');
  const [lobbyErr, setLobbyErr] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [shareMsg, setShareMsg] = useState('');
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const [camPermission, setCamPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [hasUnseen, setHasUnseen] = useState(false);

  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);
  const remoteAudioRefs = useRef<(HTMLAudioElement | null)[]>([null, null, null, null]);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const pendingJoinRef = useRef(false);
  const lobbyStreamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);
  const learnedRef = useRef<Set<string>>(new Set());
  const handleJoinRef = useRef<() => void>(() => {});

  const uiLang = gc.phase === 'lobby' || gc.phase === 'joining' ? selectedLang : gc.myLanguage;

  const setLocalVideoEl = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
  }, []);
  const videoRefCbs = useMemo(
    () => [0, 1, 2, 3].map((slot) => (el: HTMLVideoElement | null) => { remoteVideoRefs.current[slot] = el; }),
    [],
  );
  const audioRefCbs = useMemo(
    () => [0, 1, 2, 3].map((slot) => (el: HTMLAudioElement | null) => { remoteAudioRefs.current[slot] = el; }),
    [],
  );

  useEffect(() => {
    if (!roomCode || roomCode.length !== 6) router.replace('/group');
  }, [roomCode, router]);

  // Device defaults after mount: saved name + saved/browser language
  useEffect(() => {
    try {
      const savedName = localStorage.getItem('entrevoz_name');
      if (savedName) setDisplayName((prev) => prev || savedName.slice(0, 30));
    } catch {
      /* storage blocked */
    }
    if (!urlLang) setSelectedLang(preferredLanguage());
  }, [urlLang]);

  // Feed finished translations to the learning engine — only lines that
  // arrive while it's on (turning it on mid-call doesn't replay history).
  useEffect(() => {
    for (const sub of gc.subtitles) {
      if (sub.isMe || sub.status !== 'done' || learnedRef.current.has(sub.id)) continue;
      learnedRef.current.add(sub.id);
      if (!learning.enabled) continue;
      learning.addTurn('partner', sub.original, sub.translated ?? sub.original, sub.speakerLanguage, gc.myLanguage, sub.speakerLanguage);
    }
  }, [gc.subtitles, learning.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS pauses media elements in background — replay everything on return.
  // Remote tiles are muted <video>s; ALL remote sound comes from the <audio>s.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const media: (HTMLMediaElement | null)[] = [
        localVideoRef.current,
        ...remoteVideoRefs.current,
        ...remoteAudioRefs.current,
      ];
      media.forEach((m) => { if (m && m.paused) m.play().catch(() => {}); });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Lobby camera preview — same speech DSP as the call (echo cancellation
  // matters: the caption echo-gate reads this track). Handed to joinRoom.
  useEffect(() => {
    if (gc.phase !== 'lobby' || callType !== 'video') return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 }, frameRate: { ideal: 24, max: 30 } },
          audio: { ...SPEECH_AUDIO },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        lobbyStreamRef.current = stream;
        setLobbyStream(stream);
        setCamPermission('granted');
      } catch {
        if (!cancelled) setCamPermission('denied');
      }
    })();
    return () => { cancelled = true; };
  }, [gc.phase, callType]);

  // Attach the preview once its <video> exists (it only renders after the grant)
  useEffect(() => {
    const el = lobbyVideoRef.current;
    if (el && lobbyStream && el.srcObject !== lobbyStream) el.srcObject = lobbyStream;
  }, [lobbyStream, camPermission]);

  // Leaving the lobby without joining must turn the camera off
  useEffect(() => () => {
    if (!handedOffRef.current) lobbyStreamRef.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  // Agreeing on the AI-consent sheet continues a join that was waiting on it
  useEffect(() => {
    const onConsent = (e: Event) => {
      const granted = (e as CustomEvent<{ granted?: boolean }>).detail?.granted === true;
      if (granted && pendingJoinRef.current) {
        pendingJoinRef.current = false;
        handleJoinRef.current();
      }
    };
    window.addEventListener('entrevoz:ai-consent-changed', onConsent);
    return () => window.removeEventListener('entrevoz:ai-consent-changed', onConsent);
  }, []);

  // Keep the newest line in view unless the reader scrolled up
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setHasUnseen(false);
    } else if (gc.subtitles.length) {
      setHasUnseen(true);
    }
  }, [gc.subtitles, showSubtitles]);

  const handleJoin = async () => {
    const name = displayName.trim();
    if (!name) {
      setLobbyErr(t(selectedLang, 'enterName'));
      return;
    }
    if (isJoining) return;
    // App Review 5.1.1: nothing reaches AI services before consent. The sheet
    // opens; agreeing continues this join automatically.
    if (!ensureAIConsent()) {
      pendingJoinRef.current = true;
      return;
    }
    pendingJoinRef.current = false;
    gc.primeAudio(); // inside the tap — iOS only runs audio meters started by a gesture
    setIsJoining(true);
    setLobbyErr('');
    try {
      localStorage.setItem('entrevoz_name', name);
      localStorage.setItem('entrevoz_lang', selectedLang);
    } catch {
      /* storage blocked */
    }
    handedOffRef.current = true;
    await gc.joinRoom(roomCode, {
      displayName: name,
      language: selectedLang,
      callType,
      deviceId: getDeviceId(),
      existingStream: lobbyStream ?? undefined,
    });
    setIsJoining(false);
  };

  useEffect(() => {
    handleJoinRef.current = () => { void handleJoin(); };
  });

  const handleLeave = useCallback(() => {
    gc.leaveRoom();
    router.push('/');
  }, [gc.leaveRoom, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invite links carry ONLY the room — never ?lang= (guests pick their own)
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/group/${roomCode}?type=${callType}`;
    try {
      if (!navigator.share) throw new Error('share unsupported');
      await navigator.share({ title: 'Entrevoz', text: t(uiLang, 'shareText'), url });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // closed the share sheet
      await navigator.clipboard?.writeText(url).catch(() => {});
      setShareMsg(t(uiLang, 'copied'));
      setTimeout(() => setShareMsg(''), 2000);
    }
  }, [roomCode, callType, uiLang]);

  const handleWhatsApp = useCallback(() => {
    const url = `${window.location.origin}/group/${roomCode}?type=${callType}`;
    const msg = encodeURIComponent(`${t(uiLang, 'shareText')}\n\n${url}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }, [roomCode, callType, uiLang]);

  const changeLanguage = useCallback((code: string) => {
    if (!LANGUAGE_MAP[code]) return;
    gc.setMyLanguage(code);
    try { localStorage.setItem('entrevoz_lang', code); } catch { /* storage blocked */ }
  }, [gc.setMyLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickLobbyLanguage = useCallback((code: string) => {
    if (LANGUAGE_MAP[code]) setSelectedLang(code);
  }, []);

  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    atBottomRef.current = atBottom;
    if (atBottom) setHasUnseen(false);
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setHasUnseen(false);
  }, []);

  // ── LOBBY ──────────────────────────────────────────────────────────────────

  if (gc.phase === 'lobby' || gc.phase === 'joining') {
    const L = selectedLang;
    const lang = getLanguage(selectedLang);
    const joining = isJoining || gc.phase === 'joining';
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-4 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-[#00C896] text-xs font-medium tracking-widest uppercase mb-1">{t(L, 'groupCall')}</div>
            <div className="font-mono text-white text-3xl font-medium tracking-[0.3em] mb-1">{roomCode}</div>
            <div className="text-white/40 text-sm">{callType === 'video' ? t(L, 'videoAudio') : t(L, 'audioOnly')}</div>
          </div>

          {callType === 'video' && (
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden mb-3 border border-white/10">
              {camPermission === 'granted' && lobbyStream ? (
                <video ref={lobbyVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              ) : camPermission === 'denied' ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center px-4">
                    <span className="text-3xl">📵</span>
                    <p className="text-red-400 text-sm mt-2">{t(L, 'cameraDenied')}</p>
                    <p className="text-white/40 text-xs mt-1">{t(L, 'cameraDeniedHint')}</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-white/40 text-xs mt-2">{t(L, 'startingCamera')}</p>
                  </div>
                </div>
              )}
              {camPermission === 'granted' && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-white text-xs">{t(L, 'cameraReady')}</span>
                </div>
              )}
            </div>
          )}

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 mb-3 backdrop-blur-sm">
            <div className="mb-4">
              <label htmlFor="gc-name" className="text-white/50 text-xs uppercase tracking-wide block mb-1.5">{t(L, 'yourName')}</label>
              <input
                id="gc-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleJoin(); }}
                placeholder={t(L, 'namePlaceholder')}
                maxLength={30}
                autoComplete="name"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#00C896] transition-colors"
              />
            </div>

            <div className="mb-5" data-testid="lobby-language" data-selected={selectedLang}>
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1.5">{t(L, 'iSpeak')}</div>
              <LanguagePick value={selectedLang} onChange={pickLobbyLanguage} accent="#00C896" />
              <p className="text-white/45 text-[11px] mt-2 leading-snug">
                <span className="text-white/85 font-medium">{lang.flag} {lang.nativeName}</span> — {t(L, 'iSpeakHint')}
              </p>
            </div>

            {lobbyErr && <p className="text-red-400 text-sm mb-3 text-center">{lobbyErr}</p>}

            <button
              onClick={() => void handleJoin()}
              disabled={joining || !displayName.trim()}
              className="w-full py-3.5 bg-[#00C896] text-[#06060a] font-semibold rounded-xl disabled:opacity-40 hover:bg-[#00b886] transition-colors"
            >
              {joining ? t(L, 'joining') : t(L, 'join')}
            </button>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-sm">
            <div className="text-white/40 text-xs mb-3 text-center">{t(L, 'inviteOthers')}</div>
            <div className="flex gap-2">
              <button onClick={handleWhatsApp} className="flex-1 py-2.5 bg-[#25D366]/20 text-[#25D366] rounded-xl text-sm font-medium hover:bg-[#25D366]/30 transition-colors">
                WhatsApp
              </button>
              <button onClick={() => void handleShare()} className="flex-1 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/15 transition-colors">
                {shareMsg || t(L, 'copyLink')}
              </button>
            </div>
          </div>

          <p className="text-white/20 text-xs text-center mt-4">{t(L, 'noApp')}</p>
        </div>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────

  if (gc.phase === 'error') {
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-white text-lg font-medium mb-2">{t(uiLang, 'somethingWrong')}</h2>
          <p className="text-white/50 text-sm mb-6 leading-relaxed">{gc.error}</p>
          <div className="flex gap-3">
            <button onClick={() => router.push('/group')} className="flex-1 py-2.5 bg-white/10 text-white rounded-xl text-sm">{t(uiLang, 'back')}</button>
            <button onClick={() => window.location.reload()} className="flex-1 py-2.5 bg-[#00C896] text-[#06060a] rounded-xl text-sm font-medium">{t(uiLang, 'retry')}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED ──────────────────────────────────────────────────────────────────

  if (gc.phase === 'ended') {
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00C896]/10 border border-[#00C896]/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-[#00C896]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-medium mb-2">{t(uiLang, 'callEnded')}</h2>
          <p className="text-white/40 mb-6">{t(uiLang, 'thanks')}</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-[#00C896] text-[#06060a] rounded-xl font-medium">
            {t(uiLang, 'goHome')}
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE CALL ────────────────────────────────────────────────────────────

  const L = gc.myLanguage;
  const myColor = slotColor(gc.mySlotIndex);
  const remoteList = gc.participants.filter((p, i): p is Participant => p !== null && i !== gc.mySlotIndex);
  const myLangObj = getLanguage(gc.myLanguage);
  const spoken = new Set<string>([gc.myLanguage.split('-')[0]]);
  remoteList.forEach((p) => spoken.add(p.language.split('-')[0]));
  const bannerText = remoteList.length === 0
    ? t(L, 'aloneHint')
    : (spoken.size > 1 ? t(L, 'translatedFor') : t(L, 'sameLanguage')).replace('{lang}', myLangObj.nativeName);
  // A remote line updated in the last 2s lights that tile even if the level
  // meter missed it (quiet mics, iOS meters that start late)
  const now = Date.now();
  const liveSlots = new Set<number>();
  gc.subtitles.forEach((s) => {
    if (!s.isMe && !s.isFinal && now - s.updatedAt < 2000) liveSlots.add(s.speakerSlot);
  });

  return (
    <div className="h-[100dvh] bg-[#06060a] flex flex-col overflow-hidden" data-phase="active">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[#00C896] text-sm font-medium tracking-widest">{roomCode}</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00C896] animate-pulse" />
            <span className="text-white/50 text-xs" data-testid="people-count">
              {gc.participantCount} {gc.participantCount === 1 ? t(L, 'person') : t(L, 'people')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleWhatsApp} className="text-xs px-2.5 py-1 bg-[#25D366]/20 text-[#25D366] rounded-lg">
            + {t(L, 'invite')}
          </button>
          <button
            onClick={() => setShowSubtitles((s) => !s)}
            aria-pressed={showSubtitles}
            aria-label={t(L, 'captions')}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${showSubtitles ? 'bg-[#00C896]/20 text-[#00C896]' : 'bg-white/10 text-white/40'}`}
          >
            CC
          </button>
        </div>
      </div>

      {/* What I speak = what everyone is translated into for me */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[#00C896]/15 bg-[#00C896]/[0.07]" data-testid="language-bar">
        <span className="text-white/60 text-xs flex-shrink-0">{t(L, 'youSpeak')}</span>
        <LangSelect value={gc.myLanguage} onChange={changeLanguage} label={t(L, 'yourLanguage')} />
        <span className="text-[#00C896]/90 text-[11px] leading-tight min-w-0 truncate" data-testid="translation-banner">
          {bannerText}
        </span>
      </div>

      {/* Video grid */}
      <div className="flex-1 min-h-0 p-2 grid grid-cols-2 grid-rows-2 gap-2">
        <MyTile
          stream={gc.localStream}
          showVideo={callType === 'video' && !gc.isCameraOff && !!gc.localStream}
          label={t(L, 'you')}
          name={displayName}
          lang={gc.myLanguage}
          color={myColor}
          speaking={gc.localSpeaking}
          muted={gc.isMuted}
          videoRef={setLocalVideoEl}
        />
        {[0, 1, 2].map((i) => {
          const p = remoteList[i];
          if (!p) {
            return <EmptyTile key={`empty-${i}`} label={t(L, 'waiting')} inviteLabel={t(L, 'invite')} onInvite={() => void handleShare()} />;
          }
          return (
            <RemoteTile
              key={`slot-${p.slotIndex}`}
              p={p}
              callType={callType}
              color={slotColor(p.slotIndex)}
              speaking={p.isSpeaking || liveSlots.has(p.slotIndex)}
              uiLang={L}
              onRetry={gc.retryConnection}
              videoRef={videoRefCbs[p.slotIndex]}
              audioRef={audioRefCbs[p.slotIndex]}
            />
          );
        })}
      </div>

      {/* Learning Insight Card */}
      {learning.enabled && (learning.insight || learning.insightLoading) && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-amber-500/10 bg-black/40 max-h-[30vh] overflow-y-auto">
          <LearningInsightCard
            insight={learning.insight!}
            isLoading={learning.insightLoading}
            onSaveWord={learning.saveWord}
            partnerLang=""
            onDismiss={learning.dismissInsight}
          />
        </div>
      )}

      {/* Conversation — every line, every speaker, in MY language */}
      {showSubtitles && (
        <div
          className="relative flex-shrink-0 border-t border-white/5 bg-black/40"
          style={{ height: gc.subtitles.length ? '38vh' : undefined }}
        >
          <div
            ref={feedRef}
            onScroll={onFeedScroll}
            className="h-full overflow-y-auto overscroll-contain px-3 py-2 space-y-2.5"
            style={{ WebkitOverflowScrolling: 'touch' }}
            aria-label={t(L, 'conversation')}
            data-testid="feed"
          >
            {gc.subtitles.length === 0 ? (
              <p className="text-center text-white/35 text-xs py-3">{t(L, 'emptyFeed')}</p>
            ) : (
              gc.subtitles.map((sub) => (
                <FeedItem
                  key={sub.id}
                  sub={sub}
                  color={slotColor(sub.speakerSlot)}
                  uiLang={L}
                  learning={learning.enabled}
                  onRetry={gc.retryTranslation}
                  onWordSaved={learning.saveWord}
                />
              ))
            )}
          </div>
          {hasUnseen && (
            <button
              onClick={jumpToLatest}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#00C896] text-[#06060a] text-xs font-semibold shadow-lg"
            >
              ↓ {t(L, 'newMessages')}
            </button>
          )}
        </div>
      )}

      {/* Caption status + controls */}
      <div className="flex-shrink-0 bg-black/40 border-t border-white/5">
        <SttStatusBar
          state={gc.sttState}
          engine={gc.sttEngine}
          lang={gc.myLanguage}
          speaking={gc.localSpeaking}
          uiLang={L}
          onRestart={gc.restartCaptions}
          onBackup={gc.switchToBackupCaptions}
        />
        <div className="flex items-center justify-center gap-2.5 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={gc.toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              gc.isMuted ? 'bg-red-500 text-white' : 'bg-white/15 text-white hover:bg-white/20'
            }`}
            title={gc.isMuted ? t(L, 'unmute') : t(L, 'mute')}
            aria-label={gc.isMuted ? t(L, 'unmute') : t(L, 'mute')}
            aria-pressed={gc.isMuted}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {gc.isMuted ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>

          {callType === 'video' && (
            <button
              onClick={gc.toggleCamera}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                gc.isCameraOff ? 'bg-red-500 text-white' : 'bg-white/15 text-white hover:bg-white/20'
              }`}
              title={gc.isCameraOff ? t(L, 'cameraOn') : t(L, 'cameraOff')}
              aria-label={gc.isCameraOff ? t(L, 'cameraOn') : t(L, 'cameraOff')}
              aria-pressed={gc.isCameraOff}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {gc.isCameraOff ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
            </button>
          )}

          <LangSelect compact value={gc.myLanguage} onChange={changeLanguage} label={t(L, 'yourLanguage')} />

          <LearningMode
            enabled={learning.enabled}
            onToggle={learning.toggle}
            partnerLang=""
            userLang={gc.myLanguage}
            savedWords={learning.savedWords}
          />

          <button
            onClick={handleLeave}
            className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            title={t(L, 'leave')}
            aria-label={t(L, 'leave')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
