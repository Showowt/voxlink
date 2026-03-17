import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Entrevoz — Your Voice. Any Language. Instantly.";
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
          "radial-gradient(circle at 25% 25%, #00DBA8 0%, transparent 50%), radial-gradient(circle at 75% 75%, #FF3B7A 0%, transparent 50%)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 120,
          height: 120,
          borderRadius: 24,
          background: "linear-gradient(135deg, #00DBA8, #FF3B7A)",
          marginBottom: 32,
          fontSize: 64,
        }}
      >
        🎙️
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: "white",
          marginBottom: 16,
          letterSpacing: "-0.02em",
        }}
      >
        Entrevoz
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 32,
          color: "#00DBA8",
          marginBottom: 24,
        }}
      >
        Your Voice. Any Language. Instantly.
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
        AI-powered real-time voice translation for real conversations. 12
        languages.
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
        <span style={{ color: "#00DBA8" }}>↔</span>
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
        Powered by MachineMind
      </div>
    </div>,
    { ...size },
  );
}
