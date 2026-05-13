'use client';

import { useReducer, useRef, useEffect, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import type {
  UseGroupCallReturn, Participant, SubtitleEntry, JoinOptions,
  SlotIndex, DataChannelMessage, ParticipantSlot, CallType,
} from '@/app/lib/group-call/types';
import type {
  SpeechRecognitionInstance,
  SpeechRecognitionEvent as SREvent,
  SpeechRecognitionErrorEvent as SRErrorEvent,
} from '@/app/lib/speech-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const VAD_INTERVAL = 200;
const SUBTITLE_MAX_AGE = 8000;
const SUBTITLE_PRUNE_INTERVAL = 2000;
const RECONNECT_MAX = 3;
const RECONNECT_BASE_DELAY = 2000;

const PEERJS_SERVERS = [
  { host: '0.peerjs.com', port: 443, secure: true, path: '/' },
  { host: 'peerjs.92k.de', port: 443, secure: true, path: '/' },
];

const GROUP_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 },
           frameRate: { ideal: 24, max: 30 } },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

const GROUP_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  video: false,
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

// ─── State ────────────────────────────────────────────────────────────────────

interface State {
  phase: 'lobby' | 'joining' | 'active' | 'ended' | 'error';
  error: string | null;
  mySlotIndex: SlotIndex | null;
  myLanguage: string;
  isMuted: boolean;
  isCameraOff: boolean;
  participants: (Participant | null)[];
  subtitles: SubtitleEntry[];
}

type Action =
  | { type: 'SET_PHASE'; phase: State['phase']; error?: string }
  | { type: 'SET_SLOT'; slotIndex: SlotIndex }
  | { type: 'SET_LANGUAGE'; language: string }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'TOGGLE_CAMERA' }
  | { type: 'PARTICIPANT_ADD'; slotIndex: number; participant: Participant }
  | { type: 'PARTICIPANT_REMOVE'; slotIndex: number }
  | { type: 'PARTICIPANT_STREAM'; slotIndex: number; stream: MediaStream }
  | { type: 'PARTICIPANT_STATE'; slotIndex: number; muted?: boolean; cameraOff?: boolean }
  | { type: 'PARTICIPANT_SPEAKING'; slotIndex: number; speaking: boolean }
  | { type: 'PARTICIPANT_QUALITY'; slotIndex: number; quality: 1|2|3|4 }
  | { type: 'SUBTITLE_ADD'; subtitle: SubtitleEntry }
  | { type: 'SUBTITLE_UPDATE'; id: string; translated: string; isFinal: boolean }
  | { type: 'SUBTITLE_PRUNE' };

const INIT: State = {
  phase: 'lobby',
  error: null,
  mySlotIndex: null,
  myLanguage: 'en',
  isMuted: false,
  isCameraOff: false,
  participants: [null, null, null, null],
  subtitles: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase, error: action.error ?? null };
    case 'SET_SLOT':
      return { ...state, mySlotIndex: action.slotIndex };
    case 'SET_LANGUAGE':
      return { ...state, myLanguage: action.language };
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted };
    case 'TOGGLE_CAMERA':
      return { ...state, isCameraOff: !state.isCameraOff };
    case 'PARTICIPANT_ADD': {
      const p = [...state.participants];
      p[action.slotIndex] = action.participant;
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_REMOVE': {
      const p = [...state.participants];
      p[action.slotIndex] = null;
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_STREAM': {
      const p = [...state.participants];
      if (p[action.slotIndex]) {
        p[action.slotIndex] = { ...p[action.slotIndex]!, stream: action.stream, status: 'active' };
      }
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_STATE': {
      const p = [...state.participants];
      if (p[action.slotIndex]) {
        p[action.slotIndex] = {
          ...p[action.slotIndex]!,
          ...(action.muted !== undefined && { isMuted: action.muted }),
          ...(action.cameraOff !== undefined && { isCameraOff: action.cameraOff }),
        };
      }
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_SPEAKING': {
      const p = [...state.participants];
      if (p[action.slotIndex]) {
        p[action.slotIndex] = { ...p[action.slotIndex]!, isSpeaking: action.speaking };
      }
      return { ...state, participants: p };
    }
    case 'PARTICIPANT_QUALITY': {
      const p = [...state.participants];
      if (p[action.slotIndex]) {
        p[action.slotIndex] = { ...p[action.slotIndex]!, connectionQuality: action.quality };
      }
      return { ...state, participants: p };
    }
    case 'SUBTITLE_ADD':
      return { ...state, subtitles: [...state.subtitles.slice(-30), action.subtitle] };
    case 'SUBTITLE_UPDATE':
      return {
        ...state,
        subtitles: state.subtitles.map(s =>
          s.id === action.id ? { ...s, translated: action.translated, isFinal: action.isFinal } : s
        ),
      };
    case 'SUBTITLE_PRUNE': {
      const cutoff = Date.now() - SUBTITLE_MAX_AGE;
      return { ...state, subtitles: state.subtitles.filter(s => s.timestamp > cutoff) };
    }
    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGroupCall(): UseGroupCallReturn {
  const [state, dispatch] = useReducer(reducer, INIT);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataConnsRef = useRef<Map<number, DataConnection>>(new Map());
  const mediaConnsRef = useRef<Map<number, MediaConnection>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRef = useRef<Map<number, { analyser: AnalyserNode; threshold: number }>>(new Map());
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pruneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const roomCodeRef = useRef('');
  const mySlotRef = useRef<number>(-1);
  const myLangRef = useRef('en');
  const callTypeRef = useRef<CallType>('video');
  const reconnectCountRef = useRef<Map<number, number>>(new Map());
  const participantsRef = useRef<(Participant | null)[]>([null, null, null, null]);
  const phaseRef = useRef<State['phase']>('lobby');
  const myPeerIdRef = useRef('');
  const displayNameRef = useRef('');
  const deviceIdRef = useRef('');
  const supabaseChannelRef = useRef<unknown>(null);

  // Keep refs in sync
  useEffect(() => { myLangRef.current = state.myLanguage; }, [state.myLanguage]);
  useEffect(() => { phaseRef.current = state.phase; }, [state.phase]);
  useEffect(() => { participantsRef.current = state.participants; }, [state.participants]);
  useEffect(() => {
    if (state.mySlotIndex !== null) mySlotRef.current = state.mySlotIndex;
  }, [state.mySlotIndex]);

  // ─── Broadcast via data channels ─────────────────────────────────────────────

  const broadcast = useCallback((msg: DataChannelMessage) => {
    const encoded = JSON.stringify(msg);
    dataConnsRef.current.forEach(dc => {
      if (dc.open) {
        try { dc.send(encoded); } catch { /* peer gone */ }
      }
    });
  }, []);

  // ─── VAD setup per remote stream ─────────────────────────────────────────────

  const setupVAD = useCallback((slotIndex: number, stream: MediaStream) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);

    // 2-second ambient calibration
    const buf = new Float32Array(analyser.frequencyBinCount);
    const samples: number[] = [];
    const calTimer = setTimeout(() => {
      const avg = samples.length
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : 0.01;
      vadRef.current.set(slotIndex, { analyser, threshold: Math.max(0.005, avg * 3) });
    }, 2000);
    const calInterval = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
      samples.push(rms);
    }, 100);
    setTimeout(() => clearInterval(calInterval), 2100);

    return () => {
      clearTimeout(calTimer);
      clearInterval(calInterval);
      vadRef.current.delete(slotIndex);
      try { src.disconnect(); } catch { /* ignore */ }
    };
  }, []);

  const startVAD = useCallback(() => {
    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    const buf = new Float32Array(256);
    vadTimerRef.current = setInterval(() => {
      vadRef.current.forEach(({ analyser, threshold }, slot) => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
        dispatch({ type: 'PARTICIPANT_SPEAKING', slotIndex: slot, speaking: rms > threshold });
      });
    }, VAD_INTERVAL);
  }, []);

  // ─── DataChannel message handler ──────────────────────────────────────────────

  const handleDCMessage = useCallback(async (raw: string, fromSlot: number) => {
    let msg: DataChannelMessage;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'transcript') {
      const myLang = myLangRef.current;
      const id = `${fromSlot}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const speaker = participantsRef.current[fromSlot];
      const isSame = msg.language === myLang;

      dispatch({
        type: 'SUBTITLE_ADD',
        subtitle: {
          id,
          speakerSlot: fromSlot as SlotIndex,
          speakerName: speaker?.displayName ?? `Person ${fromSlot + 1}`,
          speakerLanguage: msg.language,
          original: msg.text,
          translated: isSame ? msg.text : null,
          isFinal: msg.isFinal,
          timestamp: Date.now(),
        },
      });

      if (!isSame && msg.isFinal && msg.text.trim().length > 0) {
        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: msg.text, sourceLang: msg.language, targetLang: myLang }),
          });
          if (res.ok) {
            const d = await res.json();
            dispatch({ type: 'SUBTITLE_UPDATE', id, translated: d.translation ?? msg.text, isFinal: true });
          } else {
            dispatch({ type: 'SUBTITLE_UPDATE', id, translated: msg.text, isFinal: true });
          }
        } catch {
          dispatch({ type: 'SUBTITLE_UPDATE', id, translated: msg.text, isFinal: true });
        }
      }
    } else if (msg.type === 'mute') {
      dispatch({ type: 'PARTICIPANT_STATE', slotIndex: fromSlot, muted: msg.muted });
    } else if (msg.type === 'camera') {
      dispatch({ type: 'PARTICIPANT_STATE', slotIndex: fromSlot, cameraOff: msg.off });
    } else if (msg.type === 'presence') {
      // Update participant info
      const existing = participantsRef.current[msg.slotIndex];
      if (existing) {
        dispatch({
          type: 'PARTICIPANT_ADD',
          slotIndex: msg.slotIndex,
          participant: { ...existing, displayName: msg.displayName, language: msg.language },
        });
      }
    } else if (msg.type === 'ping') {
      const dc = dataConnsRef.current.get(fromSlot);
      if (dc?.open) dc.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
    }
  }, []);

  // ─── Connect to a remote peer ─────────────────────────────────────────────────

  const connectToPeer = useCallback((remotePeerId: string, remoteSlot: number, remoteInfo: ParticipantSlot) => {
    const peer = peerRef.current;
    if (!peer || peer.destroyed) return;

    // Add participant placeholder
    dispatch({
      type: 'PARTICIPANT_ADD',
      slotIndex: remoteSlot,
      participant: {
        slotIndex: remoteSlot as SlotIndex,
        deviceId: remoteInfo.deviceId,
        displayName: remoteInfo.displayName,
        language: remoteInfo.language,
        peerId: remotePeerId,
        status: 'connecting',
        isSpeaking: false,
        isMuted: false,
        isCameraOff: false,
        stream: null,
        connectionQuality: 2,
      },
    });

    // Data connection
    const dc = peer.connect(remotePeerId, { reliable: true, metadata: {
      type: 'group',
      roomCode: roomCodeRef.current,
      slotIndex: mySlotRef.current,
      displayName: displayNameRef.current,
      language: myLangRef.current,
    }});

    dc.on('open', () => {
      dataConnsRef.current.set(remoteSlot, dc);
      // Send presence
      dc.send(JSON.stringify({
        type: 'presence',
        displayName: displayNameRef.current,
        language: myLangRef.current,
        slotIndex: mySlotRef.current,
      }));
    });

    dc.on('data', (data) => {
      handleDCMessage(typeof data === 'string' ? data : JSON.stringify(data), remoteSlot);
    });

    dc.on('close', () => {
      dataConnsRef.current.delete(remoteSlot);
    });

    dc.on('error', () => {
      dataConnsRef.current.delete(remoteSlot);
      const attempts = reconnectCountRef.current.get(remoteSlot) ?? 0;
      if (attempts < RECONNECT_MAX && phaseRef.current === 'active') {
        reconnectCountRef.current.set(remoteSlot, attempts + 1);
        setTimeout(() => connectToPeer(remotePeerId, remoteSlot, remoteInfo), RECONNECT_BASE_DELAY * (attempts + 1));
      }
    });

    // Media connection (video/audio)
    if (localStreamRef.current) {
      const mc = peer.call(remotePeerId, localStreamRef.current, { metadata: {
        type: 'group',
        roomCode: roomCodeRef.current,
        slotIndex: mySlotRef.current,
      }});

      mc.on('stream', (remoteStream) => {
        dispatch({ type: 'PARTICIPANT_STREAM', slotIndex: remoteSlot, stream: remoteStream });
        dispatch({ type: 'PARTICIPANT_QUALITY', slotIndex: remoteSlot, quality: 4 });
        setupVAD(remoteSlot, remoteStream);
        startVAD();
      });

      mc.on('close', () => {
        mediaConnsRef.current.delete(remoteSlot);
      });

      mc.on('error', () => {
        dispatch({ type: 'PARTICIPANT_QUALITY', slotIndex: remoteSlot, quality: 1 });
      });

      mediaConnsRef.current.set(remoteSlot, mc);
    }
  }, [handleDCMessage, setupVAD, startVAD]);

  // ─── Speech recognition (my voice to broadcast) ───────────────────────────────

  const startSTT = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    const r: SpeechRecognitionInstance = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = myLangRef.current;
    r.maxAlternatives = 1;

    r.onresult = (e: SREvent) => {
      const result = e.results[e.results.length - 1];
      const text = result[0].transcript.trim();
      if (!text) return;
      broadcast({
        type: 'transcript',
        text,
        isFinal: result.isFinal,
        language: myLangRef.current,
        speakerSlot: mySlotRef.current as SlotIndex,
      });
    };

    r.onerror = (e: SRErrorEvent) => {
      if (['aborted', 'no-speech'].includes(e.error)) return;
      if (e.error === 'network') setTimeout(startSTT, 1000);
    };

    r.onend = () => {
      if (phaseRef.current === 'active') {
        setTimeout(() => { try { r.start(); } catch { /* ignore */ } }, 200);
      }
    };

    try {
      r.start();
      recognitionRef.current = r;
    } catch { /* not supported */ }
  }, [broadcast]);

  // ─── Handle incoming connections ──────────────────────────────────────────────

  const setupIncomingHandlers = useCallback(() => {
    const peer = peerRef.current;
    if (!peer) return;

    peer.on('connection', (dc: DataConnection) => {
      const meta = dc.metadata;
      if (meta?.type !== 'group' || meta?.roomCode !== roomCodeRef.current) return;

      const remoteSlot = meta.slotIndex as number;

      dc.on('open', () => {
        dataConnsRef.current.set(remoteSlot, dc);
        // Send presence back
        dc.send(JSON.stringify({
          type: 'presence',
          displayName: displayNameRef.current,
          language: myLangRef.current,
          slotIndex: mySlotRef.current,
        }));
      });

      dc.on('data', (data) => {
        handleDCMessage(typeof data === 'string' ? data : JSON.stringify(data), remoteSlot);
      });

      dc.on('close', () => dataConnsRef.current.delete(remoteSlot));
    });

    peer.on('call', (mc: MediaConnection) => {
      const meta = mc.metadata;
      if (meta?.type !== 'group' || meta?.roomCode !== roomCodeRef.current) return;

      const remoteSlot = meta.slotIndex as number;

      // Answer with local stream
      mc.answer(localStreamRef.current || undefined);

      mc.on('stream', (remoteStream) => {
        dispatch({ type: 'PARTICIPANT_STREAM', slotIndex: remoteSlot, stream: remoteStream });
        dispatch({ type: 'PARTICIPANT_QUALITY', slotIndex: remoteSlot, quality: 4 });
        setupVAD(remoteSlot, remoteStream);
        startVAD();
      });

      mc.on('close', () => mediaConnsRef.current.delete(remoteSlot));
      mediaConnsRef.current.set(remoteSlot, mc);
    });
  }, [handleDCMessage, setupVAD, startVAD]);

  // ─── Public: joinRoom ─────────────────────────────────────────────────────────

  const joinRoom = useCallback(async (roomCode: string, opts: JoinOptions) => {
    dispatch({ type: 'SET_PHASE', phase: 'joining' });
    dispatch({ type: 'SET_LANGUAGE', language: opts.language });
    myLangRef.current = opts.language;
    roomCodeRef.current = roomCode.toUpperCase();
    callTypeRef.current = opts.callType;
    displayNameRef.current = opts.displayName;
    deviceIdRef.current = opts.deviceId;

    try {
      // Get local media
      const constraints = opts.callType === 'video' ? GROUP_VIDEO_CONSTRAINTS : GROUP_AUDIO_CONSTRAINTS;
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // Claim a slot via API
      const slotRes = await fetch('/api/group/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: roomCode.toUpperCase(),
          deviceId: opts.deviceId,
          displayName: opts.displayName,
          language: opts.language,
        }),
      });

      if (!slotRes.ok) {
        const err = await slotRes.json().catch(() => ({ error: 'Failed to join' }));
        throw new Error(err.error || 'Room is full or unavailable');
      }

      const slotData = await slotRes.json();
      const mySlot = slotData.slotIndex as SlotIndex;
      const existingParticipants = (slotData.participants || []) as ParticipantSlot[];

      mySlotRef.current = mySlot;
      dispatch({ type: 'SET_SLOT', slotIndex: mySlot });

      // Create PeerJS instance with deterministic ID
      const myPeerId = `entrevoz-group-${roomCode.toUpperCase()}-slot${mySlot}`;
      myPeerIdRef.current = myPeerId;

      // Fetch TURN servers for NAT traversal (critical for mobile/firewall)
      let iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
      try {
        const turnRes = await fetch('/api/turn');
        if (turnRes.ok) {
          const turnData = await turnRes.json();
          if (turnData.iceServers?.length) {
            iceServers = turnData.iceServers;
          }
        }
      } catch {
        console.warn('[GroupCall] Could not fetch TURN servers, using STUN only');
      }

      let connected = false;
      for (let i = 0; i < PEERJS_SERVERS.length && !connected; i++) {
        const server = PEERJS_SERVERS[i];
        try {
          const peer = new Peer(myPeerId, {
            host: server.host,
            port: server.port,
            secure: server.secure,
            path: server.path,
            config: { iceServers },
          });

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('PeerJS timeout')), 8000);
            peer.on('open', () => { clearTimeout(timeout); resolve(); });
            peer.on('error', (err) => { clearTimeout(timeout); reject(err); });
          });

          peerRef.current = peer;
          connected = true;
        } catch {
          continue;
        }
      }

      if (!connected) {
        throw new Error('Could not connect to signaling server. Check your internet.');
      }

      // Setup incoming connection handlers
      setupIncomingHandlers();

      // Connect to existing participants
      for (const p of existingParticipants) {
        if (p && p.slotIndex !== mySlot) {
          connectToPeer(p.peerId, p.slotIndex, p);
        }
      }

      dispatch({ type: 'SET_PHASE', phase: 'active' });
      startSTT();

      // Start subtitle pruning
      pruneTimerRef.current = setInterval(() => dispatch({ type: 'SUBTITLE_PRUNE' }), SUBTITLE_PRUNE_INTERVAL);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join';
      const isPermission = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied');
      dispatch({
        type: 'SET_PHASE',
        phase: 'error',
        error: isPermission
          ? 'Microphone access denied. Please allow microphone access and try again.'
          : msg,
      });
    }
  }, [setupIncomingHandlers, connectToPeer, startSTT]);

  // ─── Public: leaveRoom ────────────────────────────────────────────────────────

  const leaveRoom = useCallback(() => {
    // Stop STT
    try { (recognitionRef.current as SpeechRecognitionInstance)?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;

    // Stop local media
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Close all connections
    dataConnsRef.current.forEach(dc => { try { dc.close(); } catch { /* ignore */ } });
    dataConnsRef.current.clear();
    mediaConnsRef.current.forEach(mc => { try { mc.close(); } catch { /* ignore */ } });
    mediaConnsRef.current.clear();

    // Stop VAD
    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    vadRef.current.clear();
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;

    // Stop subtitle pruning
    if (pruneTimerRef.current) clearInterval(pruneTimerRef.current);

    // Destroy PeerJS
    try { peerRef.current?.destroy(); } catch { /* ignore */ }
    peerRef.current = null;

    // Leave room on server
    fetch('/api/group/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode: roomCodeRef.current,
        slotIndex: mySlotRef.current,
        deviceId: deviceIdRef.current,
      }),
    }).catch(() => {});

    // Cleanup Supabase channel
    if (supabaseChannelRef.current) {
      try {
        (supabaseChannelRef.current as { unsubscribe: () => void }).unsubscribe();
      } catch { /* ignore */ }
    }

    dispatch({ type: 'SET_PHASE', phase: 'ended' });
  }, []);

  // ─── Public: controls ─────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const newMuted = !state.isMuted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    if (newMuted) {
      try { (recognitionRef.current as SpeechRecognitionInstance)?.stop(); } catch { /* ignore */ }
    } else {
      startSTT();
    }
    broadcast({ type: 'mute', muted: newMuted });
    dispatch({ type: 'TOGGLE_MUTE' });
  }, [state.isMuted, broadcast, startSTT]);

  const toggleCamera = useCallback(() => {
    const newOff = !state.isCameraOff;
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    broadcast({ type: 'camera', off: newOff });
    dispatch({ type: 'TOGGLE_CAMERA' });
  }, [state.isCameraOff, broadcast]);

  const setMyLanguage = useCallback((lang: string) => {
    myLangRef.current = lang;
    dispatch({ type: 'SET_LANGUAGE', language: lang });
    try { (recognitionRef.current as SpeechRecognitionInstance)?.stop(); } catch { /* ignore */ }
    setTimeout(startSTT, 300);
  }, [startSTT]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    const onUnload = () => leaveRoom();
    const onVisibility = () => {
      if (document.hidden) {
        if (vadTimerRef.current) clearInterval(vadTimerRef.current);
      } else if (phaseRef.current === 'active') {
        startVAD();
      }
    };

    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      leaveRoom();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    phase: state.phase,
    error: state.error,
    mySlotIndex: state.mySlotIndex,
    myLanguage: state.myLanguage,
    isMuted: state.isMuted,
    isCameraOff: state.isCameraOff,
    localStream: localStreamRef.current,
    participants: state.participants,
    subtitles: state.subtitles,
    participantCount: state.participants.filter(Boolean).length + (state.mySlotIndex !== null ? 1 : 0),
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleCamera,
    setMyLanguage,
  };
}
