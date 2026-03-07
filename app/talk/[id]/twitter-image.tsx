import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Join my VoxLink Conversation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { id: string } }) {
  const roomCode = params.id?.toUpperCase() || "ROOM";

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#060810",
        backgroundImage:
          "radial-gradient(circle at 25% 25%, #00C896 0%, transparent 50%), radial-gradient(circle at 75% 75%, #0066FF 0%, transparent 50%)",
      }}
    >
      {/* Chat Icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 120,
          height: 120,
          borderRadius: 24,
          background: "linear-gradient(135deg, #00C896, #0066FF)",
          marginBottom: 32,
          fontSize: 64,
        }}
      >
        💬
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 800,
          color: "white",
          marginBottom: 16,
          letterSpacing: "-0.02em",
        }}
      >
        Join my VoxLink Conversation
      </div>

      {/* Room Code */}
      <div
        style={{
          fontSize: 36,
          color: "#00C896",
          marginBottom: 24,
          padding: "12px 32px",
          borderRadius: 12,
          border: "2px solid #00C896",
        }}
      >
        Room: {roomCode}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 24,
          color: "#9ca3af",
          textAlign: "center",
          maxWidth: 800,
        }}
      >
        Tap to start a face-to-face translated conversation. Real-time
        translation as you speak.
      </div>

      {/* Language flags */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginTop: 40,
          fontSize: 48,
        }}
      >
        <span>🇺🇸</span>
        <span style={{ color: "#00C896" }}>↔</span>
        <span>🇪🇸</span>
      </div>

      {/* Powered by */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          fontSize: 18,
          color: "#6b7280",
        }}
      >
        VoxLink™ by MachineMind
      </div>
    </div>,
    { ...size },
  );
}
