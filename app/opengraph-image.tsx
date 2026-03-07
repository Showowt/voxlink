import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "VoxLink™ — Break Language Barriers | Rompe las Barreras del Idioma";
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
          "radial-gradient(circle at 25% 25%, #00C896 0%, transparent 50%), radial-gradient(circle at 75% 75%, #0066FF 0%, transparent 50%)",
      }}
    >
      {/* Logo Container */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginBottom: 36,
          padding: "28px 48px",
          borderRadius: 28,
          background: "linear-gradient(135deg, #00c896, #0066ff)",
        }}
      >
        {/* Chat bubbles icon */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              width: 52,
              height: 36,
              borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.3)",
            }}
          />
          <div
            style={{
              width: 60,
              height: 40,
              borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.5)",
              marginLeft: 20,
            }}
          />
        </div>
        {/* VoxLink text */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-2px",
          }}
        >
          VoxLink
        </div>
      </div>

      {/* English Tagline */}
      <div
        style={{
          fontSize: 32,
          color: "#00C896",
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Break Language Barriers Instantly
      </div>

      {/* Spanish Tagline */}
      <div
        style={{
          fontSize: 28,
          color: "#9ca3af",
          marginBottom: 24,
          fontWeight: 500,
        }}
      >
        Rompe las Barreras del Idioma al Instante
      </div>

      {/* Description - Bilingual */}
      <div
        style={{
          fontSize: 20,
          color: "#6b7280",
          textAlign: "center",
          maxWidth: 800,
        }}
      >
        Real-time voice translation | Traduccion de voz en tiempo real
      </div>

      {/* Flags - US + Latin America focus */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 36,
          fontSize: 32,
        }}
      >
        <span>🇺🇸</span>
        <span>🇲🇽</span>
        <span>🇨🇴</span>
        <span>🇦🇷</span>
        <span>🇪🇸</span>
        <span>🇵🇪</span>
        <span>🇨🇱</span>
        <span>🇧🇷</span>
      </div>

      {/* Powered by */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
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
