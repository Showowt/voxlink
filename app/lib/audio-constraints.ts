// Shared mic constraints tuned for speech capture: aggressive browser-native
// DSP (echo cancel + noise suppression + auto gain) plus the newer
// experimental voice-isolation hints Chrome/WebKit honor when present.
// Goal: STT hears the speaker's words, not the room.
//
// The Google-prefixed / voiceIsolation keys are non-standard but widely
// supported and safely ignored where unknown, so we widen the type.
export const SPEECH_AUDIO: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  // Non-standard but honored on Chromium/WebKit — extra speech cleanup
  ...({
    googNoiseSuppression: true,
    googNoiseSuppression2: true,
    googEchoCancellation: true,
    googAutoGainControl: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    voiceIsolation: true,
  } as Record<string, boolean>),
};
