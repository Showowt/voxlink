// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY CONNECT - EXAMPLE IMPLEMENTATION
// Copy this component to get started quickly
// ═══════════════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import {
  ProximityClient,
  generateSessionId,
  getCurrentLocation,
  formatDistance,
  type ProximityUser,
  type ConnectionRequest,
} from "./proximity-client";

export default function ProximityConnectExample() {
  const [client, setClient] = useState<ProximityClient | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [nearbyUsers, setNearbyUsers] = useState<ProximityUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>(
    [],
  );
  const [status, setStatus] = useState<
    "idle" | "registered" | "searching" | "in_call"
  >("idle");

  // 1. Initialize on mount
  useEffect(() => {
    initProximity();
  }, []);

  async function initProximity() {
    try {
      // Get or create session ID
      let sessionId = localStorage.getItem("voxlink-session");
      if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem("voxlink-session", sessionId);
      }

      // Initialize client
      const proximityClient = new ProximityClient(sessionId);
      setClient(proximityClient);

      // Get user location
      const userLocation = await getCurrentLocation();
      setLocation(userLocation);

      // Register presence
      const result = await proximityClient.register(
        "en", // Get from user settings
        userLocation.lat,
        userLocation.lng,
        "available",
      );

      if (result.success) {
        setStatus("registered");
        console.log("✅ Registered presence:", result.userId);
      }
    } catch (error) {
      console.error("❌ Initialization error:", error);
      alert("Please enable location access to use Proximity Connect");
    }
  }

  // 2. Search for nearby users
  async function searchNearby() {
    if (!client || !location) return;

    setStatus("searching");
    const result = await client.getNearby(location.lat, location.lng, 5000); // 5km radius

    if (result.success) {
      setNearbyUsers(result.users);
      console.log(`Found ${result.count} nearby users`);
    }
  }

  // 3. Send connection request
  async function sendRequest(targetId: string) {
    if (!client) return;

    const result = await client.sendRequest(
      targetId,
      "Hey! Want to practice languages together?",
    );

    if (result.success) {
      alert("Request sent! Waiting for response...");
    } else {
      alert(`Error: ${result.error}`);
    }
  }

  // 4. Check for pending requests (poll every 5 seconds)
  useEffect(() => {
    if (!client) return;

    const interval = setInterval(async () => {
      const result = await client.getPendingRequests();
      if (result.success && result.requests.length > 0) {
        setPendingRequests(result.requests);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [client]);

  // 5. Accept request
  async function acceptRequest(requestId: string) {
    if (!client) return;

    const result = await client.respondToRequest(requestId, true);

    if (result.success && result.accepted && result.roomCode) {
      // Update status
      await client.updateStatus("in_call");
      setStatus("in_call");

      // Connect to PeerJS with room code
      console.log("Room code:", result.roomCode);
      alert(`Connecting to room: ${result.roomCode}`);

      // TODO: Integrate with existing VoxLink video call logic
      // connectToPeer(result.roomCode)
    }
  }

  // 6. Reject request
  async function rejectRequest(requestId: string) {
    if (!client) return;

    await client.respondToRequest(requestId, false);
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
  }

  // 7. Cleanup on unmount
  useEffect(() => {
    return () => {
      if (client) {
        client.removePresence();
      }
    };
  }, [client]);

  // 8. End call and return to available
  async function endCall() {
    if (!client) return;

    await client.updateStatus("available");
    setStatus("registered");

    // Refresh nearby users
    searchNearby();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // UI RENDERING
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Proximity Connect</h1>
          <p className="text-gray-400">
            Find nearby language learners • Status:{" "}
            <span className="text-[#d4af37]">{status}</span>
          </p>
        </div>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div className="mb-8 bg-[#1a1a2e] rounded-lg p-6 border border-[#d4af37]">
            <h2 className="text-xl font-bold mb-4">Incoming Requests</h2>
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex justify-between items-center mb-4"
              >
                <div>
                  <p className="font-bold">Connection Request</p>
                  <p className="text-sm text-gray-400">{request.message}</p>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => acceptRequest(request.id)}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => rejectRequest(request.id)}
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search Button */}
        {status === "registered" && (
          <button
            onClick={searchNearby}
            className="w-full bg-[#d4af37] hover:bg-[#c4a037] text-black font-bold py-4 rounded-lg mb-8"
          >
            Search for Nearby Users
          </button>
        )}

        {/* Nearby Users List */}
        {nearbyUsers.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-4">
              Found {nearbyUsers.length} users nearby
            </h2>
            {nearbyUsers.map((user) => (
              <div
                key={user.id}
                className="bg-[#1a1a2e] rounded-lg p-6 flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-lg">
                    {user.language.toUpperCase()} Speaker
                  </p>
                  <p className="text-gray-400">
                    {formatDistance(user.distance)} away
                  </p>
                </div>
                <button
                  onClick={() => sendRequest(user.id)}
                  className="bg-[#d4af37] hover:bg-[#c4a037] text-black font-bold px-6 py-3 rounded"
                >
                  Connect
                </button>
              </div>
            ))}
          </div>
        )}

        {/* In Call State */}
        {status === "in_call" && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-8 text-center">
            <p className="text-2xl font-bold mb-4">In Call</p>
            <p className="text-gray-400 mb-6">
              Connected via Proximity Connect
            </p>
            <button
              onClick={endCall}
              className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-lg font-bold"
            >
              End Call
            </button>
          </div>
        )}

        {/* Empty State */}
        {status === "searching" && nearbyUsers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-xl mb-2">No users found nearby</p>
            <p className="text-sm">
              Try increasing your search radius or check back later
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION WITH EXISTING VOXLINK
// ═══════════════════════════════════════════════════════════════════════════════

/*
To integrate with existing VoxLink video call system:

1. After acceptRequest() returns roomCode:

   import Peer from 'peerjs'

   const peer = new Peer(roomCode, {
     host: '0.peerjs.com',
     port: 443,
     secure: true
   })

   peer.on('open', (id) => {
     console.log('Connected to PeerJS:', id)
   })

   peer.on('call', (call) => {
     // Incoming call - answer with local stream
     navigator.mediaDevices.getUserMedia({ video: true, audio: true })
       .then(stream => {
         call.answer(stream)
         call.on('stream', remoteStream => {
           // Display remote video
           videoElement.srcObject = remoteStream
         })
       })
   })

2. Or if you're the requester, initiate the call:

   navigator.mediaDevices.getUserMedia({ video: true, audio: true })
     .then(stream => {
       const call = peer.call(roomCode, stream)
       call.on('stream', remoteStream => {
         videoElement.srcObject = remoteStream
       })
     })

3. Integrate with existing TranslationPanel for real-time translation

4. On call end:
   - peer.destroy()
   - await client.updateStatus('available')
   - searchNearby() to refresh list
*/
