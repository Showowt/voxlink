// ═══════════════════════════════════════════════════════════════
// ENTREVOZ GROUP CALL — TYPE DEFINITIONS
// Mesh P2P, 2-4 participants, distributed translation
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

export interface SubtitleEntry {
  id: string;
  speakerSlot: SlotIndex;
  speakerName: string;
  speakerLanguage: string;
  original: string;
  translated: string | null;
  isFinal: boolean;
  timestamp: number;
}

export interface JoinOptions {
  displayName: string;
  language: string;
  callType: CallType;
  deviceId: string;
  existingStream?: MediaStream;
}

// DataChannel messages (peer-to-peer, after connection established)
export type DataChannelMessage =
  | { type: 'transcript'; text: string; isFinal: boolean; language: string; speakerSlot: SlotIndex }
  | { type: 'mute'; muted: boolean }
  | { type: 'camera'; off: boolean }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number }
  | { type: 'presence'; displayName: string; language: string; slotIndex: SlotIndex };

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
  joinRoom: (roomCode: string, opts: JoinOptions) => Promise<void>;
  leaveRoom: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  setMyLanguage: (lang: string) => void;
}
