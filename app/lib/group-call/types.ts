// ═══════════════════════════════════════════════════════════════
// ENTREVOZ GROUP CALL — TYPE DEFINITIONS
// Mesh P2P, 2-4 participants. Each person transcribes their OWN voice;
// each receiver translates into THEIR OWN selected language.
// ═══════════════════════════════════════════════════════════════

export type SlotIndex = 0 | 1 | 2 | 3;
export type CallType = 'video' | 'audio';
export type ParticipantStatus = 'connecting' | 'active' | 'poor' | 'left';
export type CallPhase = 'lobby' | 'joining' | 'active' | 'ended' | 'error';
export type ConnectionQuality = 1 | 2 | 3 | 4;

export interface ParticipantSlot {
  deviceId: string;
  displayName: string;
  language: string;
  peerId: string;
  slotIndex: SlotIndex;
  joinedAt: number;
}

export interface Participant {
  slotIndex: SlotIndex;
  deviceId: string;
  displayName: string;
  language: string;
  peerId: string;
  status: ParticipantStatus;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  stream: MediaStream | null;
  connectionQuality: ConnectionQuality;
}

// One conversation-feed line per UTTERANCE. Interim speech updates the line in
// place; the final text locks it and — when the speaker's language differs
// from mine — triggers translation into MY language.
export type SubtitleStatus =
  | 'live' // speaker still talking; text is provisional
  | 'translating' // final text in, translation in flight
  | 'done' // translated into targetLanguage
  | 'same' // already in my language (or my own line)
  | 'failed'; // translation failed after retries — original shown + retry

export interface SubtitleEntry {
  id: string;
  speakerSlot: SlotIndex;
  speakerName: string;
  speakerLanguage: string;
  isMe: boolean;
  original: string;
  translated: string | null; // final translation, in targetLanguage
  liveTranslated: string | null; // provisional translation while still live
  targetLanguage: string;
  isFinal: boolean;
  status: SubtitleStatus;
  timestamp: number; // first seen
  updatedAt: number; // last text change
}

export interface JoinOptions {
  displayName: string;
  language: string;
  callType: CallType;
  deviceId: string;
  existingStream?: MediaStream;
}

// Caption engine for MY voice: the browser's speech service, or our own
// Whisper endpoint when that service is missing or broken on this device.
export type SttEngine = 'webspeech' | 'whisper' | 'none';
export type SttState =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'recovering'
  | 'muted'
  | 'blocked'
  | 'unavailable';

// DataChannel messages (peer-to-peer, after connection established)
export type DataChannelMessage =
  // `uid` ties the interim + final results of ONE utterance together so
  // receivers update a single line in place. Optional: clients from before
  // utterance ids omit it.
  | { type: 'transcript'; text: string; isFinal: boolean; language: string; speakerSlot: SlotIndex; uid?: string }
  | { type: 'mute'; muted: boolean }
  | { type: 'camera'; off: boolean }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'presence'; displayName: string; language: string; slotIndex: SlotIndex }
  // Sent on Leave so the tile disappears at once — a closed data channel
  // alone can take ~30s to surface on the other side.
  | { type: 'bye' };

// Supabase Realtime room state
export interface GroupRoomRow {
  id: string;
  room_code: string;
  host_device_id: string;
  max_participants: number;
  call_type: CallType;
  status: 'waiting' | 'active' | 'ended';
  participant_slots: (ParticipantSlot | null)[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

// Hook return type
export interface UseGroupCallReturn {
  phase: CallPhase;
  error: string | null;
  mySlotIndex: SlotIndex | null;
  myLanguage: string;
  isMuted: boolean;
  isCameraOff: boolean;
  localStream: MediaStream | null;
  participants: (Participant | null)[];
  subtitles: SubtitleEntry[];
  participantCount: number;
  sttState: SttState;
  sttEngine: SttEngine;
  localSpeaking: boolean;
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
}
