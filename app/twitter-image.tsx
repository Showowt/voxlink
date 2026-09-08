import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Entrevoz — Your Voice. Any Language. Instantly.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = "data:image/png;base64,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";

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
      {/* Logo — two-bubble mark on dark tile */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 128,
          height: 128,
          borderRadius: 30,
          backgroundColor: "#0D0D0D",
          border: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 32,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={82} height={45} alt="Entrevoz" />
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
