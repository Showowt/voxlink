import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Join VoxLink Video Call | Unete a la Videollamada";
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
      {/* Logo Container */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 28,
          padding: "20px 40px",
          borderRadius: 24,
          background: "linear-gradient(135deg, #00c896, #0066ff)",
        }}
      >
        {/* Chat bubbles icon */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              width: 40,
              height: 28,
              borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.3)",
            }}
          />
          <div
            style={{
              width: 48,
              height: 32,
              borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.5)",
              marginLeft: 16,
            }}
          />
        </div>
        {/* VoxLink text */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-2px",
          }}
        >
          VoxLink
        </div>
      </div>

      {/* Title - Bilingual */}
      <div
        style={{
          fontSize: 40,
          fontWeight: 700,
          color: "white",
          marginBottom: 8,
        }}
      >
        Join my Video Call
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 500,
          color: "#9ca3af",
          marginBottom: 20,
        }}
      >
        Unete a mi Videollamada
      </div>

      {/* Room Code */}
      <div
        style={{
          fontSize: 48,
          color: "#00C896",
          marginBottom: 20,
          padding: "12px 48px",
          borderRadius: 12,
          border: "3px solid #00C896",
          fontWeight: 700,
          fontFamily: "monospace",
        }}
      >
        {roomCode}
      </div>

      {/* Description - Bilingual */}
      <div
        style={{
          fontSize: 18,
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        Tap to join | Toca para unirte
      </div>

      {/* Flags */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 28,
          fontSize: 28,
        }}
      >
        <span>🇺🇸</span>
        <span>🇲🇽</span>
        <span>🇨🇴</span>
        <span>🇦🇷</span>
        <span>🇪🇸</span>
        <span>🇧🇷</span>
      </div>

      {/* Powered by */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          fontSize: 14,
          color: "#6b7280",
        }}
      >
        Powered by MachineMind
      </div>
    </div>,
    { ...size },
  );
}
