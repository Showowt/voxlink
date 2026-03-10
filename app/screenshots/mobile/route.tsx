import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  try {
    return new ImageResponse(
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0f",
          padding: 40,
        }}
      >
        {/* Status bar mockup */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          <span>9:41</span>
          <div style={{ display: "flex", gap: 4 }}>
            <span>5G</span>
            <span>100%</span>
          </div>
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
              marginRight: 12,
              fontSize: 28,
            }}
          >
            🎙️
          </div>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "white",
            }}
          >
            Voxxo
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          <span
            style={{
              fontSize: 18,
              color: "#06b6d4",
              textAlign: "center",
            }}
          >
            Real-Time Voice Translation
          </span>
        </div>

        {/* Language selector mockup */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              backgroundColor: "rgba(6, 182, 212, 0.1)",
              border: "1px solid #06b6d4",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 24 }}>🇺🇸</span>
            <span style={{ color: "white", fontSize: 14 }}>English</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#06b6d4",
              fontSize: 20,
            }}
          >
            ↔
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              border: "1px solid #3b82f6",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 24 }}>🇪🇸</span>
            <span style={{ color: "white", fontSize: 14 }}>Spanish</span>
          </div>
        </div>

        {/* Mock translation interface */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* User message */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                backgroundColor: "#06b6d4",
                borderRadius: 16,
                borderBottomRightRadius: 4,
                maxWidth: "80%",
              }}
            >
              <span style={{ color: "white", fontSize: 16 }}>
                Hello, how are you?
              </span>
            </div>
            <span style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
              🎤 Voice captured
            </span>
          </div>

          {/* Translation response */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                backgroundColor: "#3b82f6",
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                maxWidth: "80%",
              }}
            >
              <span style={{ color: "white", fontSize: 16 }}>
                Hola, como estas?
              </span>
            </div>
            <span style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
              🔊 Translated to Spanish
            </span>
          </div>

          {/* Another exchange */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                border: "1px solid #3b82f6",
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                maxWidth: "80%",
              }}
            >
              <span style={{ color: "white", fontSize: 16 }}>
                Muy bien, gracias!
              </span>
            </div>
            <span style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
              🎤 Voice captured
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 16,
                backgroundColor: "rgba(6, 182, 212, 0.2)",
                border: "1px solid #06b6d4",
                borderRadius: 16,
                borderBottomRightRadius: 4,
                maxWidth: "80%",
              }}
            >
              <span style={{ color: "white", fontSize: 16 }}>
                Very well, thank you!
              </span>
            </div>
            <span style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
              🔊 Translated to English
            </span>
          </div>
        </div>

        {/* Bottom action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
              fontSize: 28,
            }}
          >
            🎤
          </div>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 32,
            marginTop: 24,
            paddingBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              color: "#06b6d4",
            }}
          >
            <span style={{ fontSize: 20 }}>📹</span>
            <span style={{ fontSize: 12 }}>Video</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              color: "white",
            }}
          >
            <span style={{ fontSize: 20 }}>👥</span>
            <span style={{ fontSize: 12 }}>Talk</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              color: "#6b7280",
            }}
          >
            <span style={{ fontSize: 20 }}>🎵</span>
            <span style={{ fontSize: 12 }}>VoxNote</span>
          </div>
        </div>
      </div>,
      {
        width: 390,
        height: 844,
      },
    );
  } catch (error) {
    console.error("Error generating mobile screenshot:", error);
    return NextResponse.json(
      { error: "Failed to generate screenshot" },
      { status: 500 },
    );
  }
}
