import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Voxxo Face-to-Face | Traduccion Cara a Cara";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
          marginBottom: 32,
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
          fontSize: 42,
          fontWeight: 700,
          color: "white",
          marginBottom: 8,
        }}
      >
        Face-to-Face Translation
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 500,
          color: "#9ca3af",
          marginBottom: 20,
        }}
      >
        Traduccion Cara a Cara
      </div>

      {/* Subtitle - Bilingual */}
      <div
        style={{
          fontSize: 24,
          color: "#00DBA8",
          marginBottom: 16,
          fontWeight: 600,
        }}
      >
        One Device, Two Languages | Un Dispositivo, Dos Idiomas
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 18,
          color: "#6b7280",
          textAlign: "center",
          maxWidth: 700,
        }}
      >
        Place phone between two people. Each speaks their language.
      </div>

      {/* Flags */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 32,
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
