// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY CLIENT - Client-side SDK for Proximity Connect API
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProximityUser {
  id: string;
  session_id: string;
  language: string;
  distance: number;
  status: "available" | "busy" | "in_call";
}

export interface ConnectionRequest {
  id: string;
  from_session_id: string;
  to_session_id: string;
  message?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  created_at: string;
  expires_at: string;
}

export interface RegisterResponse {
  success: boolean;
  userId?: string;
  action?: "created" | "updated";
  error?: string;
}

export interface NearbyResponse {
  success: boolean;
  users: ProximityUser[];
  count: number;
  radius: number;
  fallback?: boolean;
  error?: string;
}

export interface RequestResponse {
  success: boolean;
  requestId?: string;
  expiresAt?: string;
  error?: string;
}

export interface RespondResponse {
  success: boolean;
  accepted: boolean;
  roomCode?: string;
  request?: {
    id: string;
    from_session_id: string;
    to_session_id: string;
  };
  message?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ProximityClient {
  private baseUrl: string;
  private sessionId: string;

  constructor(sessionId: string, baseUrl: string = "/api/proximity") {
    this.sessionId = sessionId;
    this.baseUrl = baseUrl;
  }

  /**
   * Register or update user presence with location
   * Call this on app start and periodically (every 5 minutes) as heartbeat
   */
  async register(
    language: string,
    lat: number,
    lng: number,
    status: "available" | "busy" | "in_call" = "available",
  ): Promise<RegisterResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          language,
          lat,
          lng,
          status,
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Register error:", error);
      return { success: false, error: "Network error" };
    }
  }

  /**
   * Get nearby users within radius (in meters)
   * Default: 5km radius
   */
  async getNearby(
    lat: number,
    lng: number,
    radius: number = 5000,
  ): Promise<NearbyResponse> {
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius: radius.toString(),
        sessionId: this.sessionId,
      });

      const response = await fetch(`${this.baseUrl}/nearby?${params}`);
      return await response.json();
    } catch (error) {
      console.error("Get nearby error:", error);
      return {
        success: false,
        users: [],
        count: 0,
        radius,
        error: "Network error",
      };
    }
  }

  /**
   * Send connection request to another user
   */
  async sendRequest(
    targetId: string,
    message?: string,
  ): Promise<RequestResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromSessionId: this.sessionId,
          targetId,
          message,
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Send request error:", error);
      return { success: false, error: "Network error" };
    }
  }

  /**
   * Get pending connection requests for current user
   */
  async getPendingRequests(): Promise<{
    success: boolean;
    requests: ConnectionRequest[];
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({ sessionId: this.sessionId });
      const response = await fetch(`${this.baseUrl}/request?${params}`);
      return await response.json();
    } catch (error) {
      console.error("Get pending requests error:", error);
      return { success: false, requests: [], error: "Network error" };
    }
  }

  /**
   * Accept or reject a connection request
   */
  async respondToRequest(
    requestId: string,
    accept: boolean,
  ): Promise<RespondResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          accept,
          sessionId: this.sessionId,
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Respond to request error:", error);
      return { success: false, accepted: false, error: "Network error" };
    }
  }

  /**
   * Remove presence on app close
   */
  async removePresence(): Promise<{ success: boolean; error?: string }> {
    try {
      const params = new URLSearchParams({ sessionId: this.sessionId });
      const response = await fetch(`${this.baseUrl}/presence?${params}`, {
        method: "DELETE",
      });

      return await response.json();
    } catch (error) {
      console.error("Remove presence error:", error);
      return { success: false, error: "Network error" };
    }
  }

  /**
   * Update presence status (e.g., available -> in_call)
   */
  async updateStatus(
    status: "available" | "busy" | "in_call",
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/presence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          status,
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Update status error:", error);
      return { success: false, error: "Network error" };
    }
  }

  /**
   * Get current presence status
   */
  async getPresence(): Promise<{
    success: boolean;
    presence?: any;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({ sessionId: this.sessionId });
      const response = await fetch(`${this.baseUrl}/presence?${params}`);
      return await response.json();
    } catch (error) {
      console.error("Get presence error:", error);
      return { success: false, error: "Network error" };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE ALIASES — match what proximity page expects
// ═══════════════════════════════════════════════════════════════════════════════

export type NearbyUser = ProximityUser;
export type ProximityRequest = ConnectionRequest;
export interface GeoPosition {
  lat: number;
  lng: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE HELPERS — re-exported for proximity page
// ═══════════════════════════════════════════════════════════════════════════════

const FLAGS: Record<string, string> = {
  en: "🇺🇸", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", pt: "🇧🇷",
  ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", ar: "🇸🇦", hi: "🇮🇳", ru: "🇷🇺",
  nl: "🇳🇱", sv: "🇸🇪", pl: "🇵🇱", tr: "🇹🇷", th: "🇹🇭", vi: "🇻🇳",
  id: "🇮🇩", ms: "🇲🇾", tl: "🇵🇭", uk: "🇺🇦", cs: "🇨🇿", ro: "🇷🇴",
  hu: "🇭🇺", el: "🇬🇷", he: "🇮🇱", da: "🇩🇰", fi: "🇫🇮", no: "🇳🇴",
  lt: "🇱🇹",
};

const NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
  hi: "Hindi", ru: "Russian", nl: "Dutch", sv: "Swedish", pl: "Polish",
  tr: "Turkish", th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay",
  tl: "Filipino", uk: "Ukrainian", cs: "Czech", ro: "Romanian", hu: "Hungarian",
  el: "Greek", he: "Hebrew", da: "Danish", fi: "Finnish", no: "Norwegian",
  lt: "Lithuanian",
};

export function getLanguageFlag(code: string): string {
  return FLAGS[code] || "🌐";
}

export function getLanguageName(code: string): string {
  return NAMES[code] || code.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate a random session ID */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/** Format distance for display */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Check if browser supports geolocation */
export function supportsGeolocation(): boolean {
  return "geolocation" in navigator;
}

/** Get current position (promise-based) */
export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!supportsGeolocation()) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/** Watch position changes — returns cleanup ID */
export function watchPosition(
  callback: (pos: GeoPosition) => void,
  errorCallback?: (err: GeolocationPositionError) => void,
): number {
  return navigator.geolocation.watchPosition(
    (position) => {
      callback({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    },
    errorCallback,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
  );
}

// Keep legacy alias
export const getCurrentLocation = getCurrentPosition;

// ═══════════════════════════════════════════════════════════════════════════════
// STANDALONE FUNCTIONS — Wrappers around ProximityClient for page usage
// Each creates/reuses a client instance keyed by sessionId.
// ═══════════════════════════════════════════════════════════════════════════════

const clients = new Map<string, ProximityClient>();
function getClient(sessionId: string): ProximityClient {
  let client = clients.get(sessionId);
  if (!client) {
    client = new ProximityClient(sessionId);
    clients.set(sessionId, client);
  }
  return client;
}

/** Register presence at location */
export async function registerPresence(
  sessionId: string,
  language: string,
  lat: number,
  lng: number,
  status: "available" | "busy" | "in_call" = "available",
): Promise<RegisterResponse> {
  return getClient(sessionId).register(language, lat, lng, status);
}

/** Update presence status */
export async function updatePresenceStatus(
  sessionId: string,
  status: "available" | "busy" | "in_call",
): Promise<{ success: boolean; error?: string }> {
  return getClient(sessionId).updateStatus(status);
}

/** Remove presence */
export async function removePresence(
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  return getClient(sessionId).removePresence();
}

/** Find nearby users */
export async function findNearbyUsers(
  sessionId: string,
  lat: number,
  lng: number,
  radius?: number,
): Promise<NearbyResponse> {
  return getClient(sessionId).getNearby(lat, lng, radius);
}

/** Send connection request */
export async function sendConnectionRequest(
  sessionId: string,
  targetId: string,
  message?: string,
): Promise<RequestResponse> {
  return getClient(sessionId).sendRequest(targetId, message);
}

/** Get pending requests */
export async function getPendingRequests(
  sessionId: string,
): Promise<{ success: boolean; requests: ConnectionRequest[]; error?: string }> {
  return getClient(sessionId).getPendingRequests();
}

/** Respond to a connection request */
export async function respondToRequest(
  sessionId: string,
  requestId: string,
  accept: boolean,
): Promise<RespondResponse> {
  return getClient(sessionId).respondToRequest(requestId, accept);
}

/** Subscribe to incoming requests (polling-based, returns cleanup function) */
export function subscribeToRequests(
  sessionId: string,
  onRequest: (request: ConnectionRequest) => void,
  onAccepted?: (roomCode: string) => void,
): () => void {
  const seen = new Set<string>();
  const interval = setInterval(async () => {
    try {
      const result = await getPendingRequests(sessionId);
      if (result.success && result.requests.length > 0) {
        for (const req of result.requests) {
          if (!seen.has(req.id)) {
            seen.add(req.id);
            if (req.status === "pending") {
              onRequest(req);
            }
          }
        }
      }
    } catch {
      // Silent retry on next interval
    }
  }, 2000);

  return () => clearInterval(interval);
}
