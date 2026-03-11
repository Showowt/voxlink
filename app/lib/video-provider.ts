// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO PROVIDER ABSTRACTION
// Switch between PeerJS (current) and Daily.co (future) with one config change
// ═══════════════════════════════════════════════════════════════════════════════

export type VideoProvider = "peerjs" | "daily";

// Current provider - change this to switch implementations
// Using 'as VideoProvider' to allow runtime switching without TS narrowing
export const CURRENT_PROVIDER = "peerjs" as VideoProvider;

// Provider configuration
export const VIDEO_CONFIG = {
  peerjs: {
    name: "PeerJS",
    description: "P2P WebRTC - free, good for 1:1 calls",
    maxParticipants: 2,
    features: ["p2p", "free", "no-server"],
    connectionFile: "./peer-connection",
  },
  daily: {
    name: "Daily.co",
    description: "Managed WebRTC - enterprise, scales to groups",
    maxParticipants: 100,
    features: ["managed", "recording", "analytics", "mobile-optimized"],
    connectionFile: "./daily-connection", // Create this when ready
    apiKey: process.env.DAILY_API_KEY || "",
  },
};

// Helper to check current provider
export const isUsingPeerJS = () => CURRENT_PROVIDER === "peerjs";
export const isUsingDaily = () => CURRENT_PROVIDER === "daily";

// Get current provider config
export const getProviderConfig = () => VIDEO_CONFIG[CURRENT_PROVIDER];

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATION CHECKLIST: PeerJS → Daily.co
// ═══════════════════════════════════════════════════════════════════════════════
//
// When ready to switch to Daily.co:
//
// 1. Install Daily SDK:
//    npm install @daily-co/daily-js
//
// 2. Add environment variable:
//    DAILY_API_KEY=your_api_key_here
//
// 3. Create /app/api/daily/room/route.ts for server-side room creation
//
// 4. Create /app/lib/daily-connection.ts matching PeerConnection interface:
//    - Same callbacks: onStatusChange, onRemoteStream, onDataMessage, etc.
//    - Same methods: connect(), disconnect(), send()
//
// 5. Change CURRENT_PROVIDER above from "peerjs" to "daily"
//
// 6. Update imports in /app/call/[id]/page.tsx:
//    - import { DailyConnection } from '../../lib/daily-connection'
//
// Daily.co API key should be stored in DAILY_API_KEY environment variable
// NEVER commit API keys to source control
//
// ═══════════════════════════════════════════════════════════════════════════════
