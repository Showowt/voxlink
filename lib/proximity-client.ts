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
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a random session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Check if browser supports geolocation
 */
export function supportsGeolocation(): boolean {
  return "geolocation" in navigator;
}

/**
 * Get current location (returns promise)
 */
export function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
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
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    );
  });
}
