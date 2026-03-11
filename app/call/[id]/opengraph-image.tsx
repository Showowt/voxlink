import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Join Voxxo Video Call | Unete a la Videollamada";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { id: string } }) {
  // Don't expose room code in social preview for security
  // Instead show a generic "Private Room" indicator
  const _roomCode = params.id; // Unused - kept for reference

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
          "radial-gradient(circle at 25% 25%, #00DBA8 0%, transparent 50%), radial-gradient(circle at 75% 75%, #0088FF 0%, transparent 50%)",
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
          background: "linear-gradient(135deg, #00dba8, #0088ff)",
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
        {/* Voxxo text */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-2px",
          }}
        >
          Voxxo
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

      {/* Secure Room Indicator - Don't expose actual room code */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 32,
          color: "#00DBA8",
          marginBottom: 20,
          padding: "12px 36px",
          borderRadius: 12,
          border: "2px solid rgba(0, 219, 168, 0.4)",
          background: "rgba(0, 219, 168, 0.1)",
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 28 }}>🔒</span>
        <span>Private Video Room</span>
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
