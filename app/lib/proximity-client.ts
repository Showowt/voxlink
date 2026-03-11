// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY CLIENT - Client-side geolocation and presence management
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

// Types
export interface NearbyUser {
  id: string;
  session_id: string;
  language: string;
  distance: number;
  status: "available" | "busy" | "in_call";
}

export interface ProximityRequest {
  id: string;
  from_session_id: string;
  to_session_id: string;
  message?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  room_code?: string;
  created_at: string;
  expires_at: string;
}

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

// Generate a unique session ID for this browser session
export function generateSessionId(): string {
  const existing = sessionStorage.getItem("voxlink_proximity_session");
  if (existing) return existing;

  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const id = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem("voxlink_proximity_session", id);
  return id;
}

// Get current geolocation
export async function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Location permission denied"));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location unavailable"));
            break;
          case error.TIMEOUT:
            reject(new Error("Location request timed out"));
            break;
          default:
            reject(new Error("Failed to get location"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  });
}

// Watch position changes
export function watchPosition(
  callback: (position: GeoPosition) => void,
  errorCallback: (error: Error) => void,
): number {
  if (!navigator.geolocation) {
    errorCallback(new Error("Geolocation not supported"));
    return -1;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      callback({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    },
    (error) => {
      errorCallback(new Error(error.message));
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    },
  );
}

// API calls
export async function registerPresence(
  sessionId: string,
  language: string,
  lat: number,
  lng: number,
  accuracy?: number,
): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
  code?: string;
}> {
  try {
    const response = await fetch("/api/proximity/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        language,
        lat,
        lng,
        accuracy, // GPS accuracy in meters for anti-spoofing
        status: "available",
      }),
    });

    const data = await response.json();
    return data;
  } catch {
    return { success: false, error: "Failed to register presence" };
  }
}

export async function updatePresenceStatus(
  sessionId: string,
  status: "available" | "busy" | "in_call",
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/proximity/presence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status }),
    });

    return await response.json();
  } catch (error) {
    return { success: false, error: "Failed to update status" };
  }
}

export async function removePresence(
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `/api/proximity/presence?sessionId=${sessionId}`,
      {
        method: "DELETE",
      },
    );

    return await response.json();
  } catch (error) {
    return { success: false, error: "Failed to remove presence" };
  }
}

export async function findNearbyUsers(
  lat: number,
  lng: number,
  radius: number = 5000,
  sessionId?: string,
): Promise<{ success: boolean; users?: NearbyUser[]; error?: string }> {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString(),
    });

    if (sessionId) {
      params.append("sessionId", sessionId);
    }

    const response = await fetch(`/api/proximity/nearby?${params}`);
    return await response.json();
  } catch (error) {
    return { success: false, error: "Failed to find nearby users" };
  }
}

export async function sendConnectionRequest(
  fromSessionId: string,
  targetId: string,
  message?: string,
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  try {
    const response = await fetch("/api/proximity/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromSessionId,
        targetId,
        message,
      }),
    });

    return await response.json();
  } catch (error) {
    return { success: false, error: "Failed to send request" };
  }
}

export async function getPendingRequests(sessionId: string): Promise<{
  success: boolean;
  requests?: ProximityRequest[];
  error?: string;
}> {
  try {
    const response = await fetch(
      `/api/proximity/request?sessionId=${sessionId}`,
    );
    return await response.json();
  } catch (error) {
    return { success: false, error: "Failed to get requests" };
  }
}

export async function respondToRequest(
  requestId: string,
  accept: boolean,
  sessionId: string,
): Promise<{ success: boolean; roomCode?: string; error?: string }> {
  try {
    const response = await fetch("/api/proximity/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        accept,
        sessionId,
      }),
    });

    return await response.json();
  } catch (error) {
    return { success: false, error: "Failed to respond to request" };
  }
}

// Supabase Realtime subscription for incoming requests
export function subscribeToRequests(
  sessionId: string,
  onRequest: (request: ProximityRequest) => void,
  onAccepted: (roomCode: string, request: ProximityRequest) => void,
): () => void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase not configured for realtime");
    return () => {};
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Subscribe to new requests targeting this session
  const channel = supabase
    .channel(`proximity_requests_${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "proximity_requests",
        filter: `to_session_id=eq.${sessionId}`,
      },
      (payload) => {
        onRequest(payload.new as ProximityRequest);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "proximity_requests",
        filter: `from_session_id=eq.${sessionId}`,
      },
      (payload) => {
        const request = payload.new as ProximityRequest;
        if (request.status === "accepted" && request.room_code) {
          onAccepted(request.room_code, request);
        }
      },
    )
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
}

// Import from main languages config for consistency
import { getFlag, getLanguage } from "./languages";

// Format distance for display
export function formatDistance(meters: number): string {
  if (meters < 100) {
    return `${Math.round(meters)}m`;
  } else if (meters < 1000) {
    return `${Math.round(meters / 10) * 10}m`;
  } else {
    return `${(meters / 1000).toFixed(1)}km`;
  }
}

// Re-export from main languages for convenience
export function getLanguageFlag(code: string): string {
  return getFlag(code);
}

export function getLanguageName(code: string): string {
  return getLanguage(code).name;
}
