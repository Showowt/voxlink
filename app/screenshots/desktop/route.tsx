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
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(6, 182, 212, 0.15) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.15) 0%, transparent 40%)",
        }}
      >
        {/* Browser chrome mockup */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 16px",
            backgroundColor: "#1a1a24",
            borderBottom: "1px solid #2a2a3a",
          }}
        >
          {/* Window controls */}
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#ff5f56",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#ffbd2e",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#27ca40",
              }}
            />
          </div>

          {/* URL bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginLeft: 24,
              flex: 1,
              padding: "8px 16px",
              backgroundColor: "#0a0a0f",
              borderRadius: 8,
            }}
          >
            <span style={{ color: "#27ca40", fontSize: 12, marginRight: 8 }}>
              🔒
            </span>
            <span style={{ color: "#9ca3af", fontSize: 14 }}>voxlink.app</span>
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: 40,
          }}
        >
          {/* Left sidebar - Language selection */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 280,
              padding: 24,
              backgroundColor: "rgba(26, 26, 36, 0.8)",
              borderRadius: 16,
              marginRight: 24,
            }}
          >
            {/* Logo */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 32,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  marginRight: 12,
                  fontSize: 22,
                }}
              >
                🎙️
              </div>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "white",
                }}
              >
                VoxLink
              </span>
            </div>

            {/* Mode selector */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 32,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  backgroundColor: "rgba(6, 182, 212, 0.1)",
                  border: "1px solid #06b6d4",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>📹</span>
                <span style={{ color: "#06b6d4", fontSize: 14 }}>
                  Video Call
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>👥</span>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>
                  Face-to-Face
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>🎵</span>
                <span style={{ color: "#9ca3af", fontSize: 14 }}>VoxNote</span>
              </div>
            </div>

            {/* Language selection */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <span
                style={{
                  color: "#6b7280",
                  fontSize: 12,
                  textTransform: "uppercase",
                }}
              >
                Languages
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  backgroundColor: "rgba(6, 182, 212, 0.1)",
                  border: "1px solid #06b6d4",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>🇺🇸</span>
                <span style={{ color: "white", fontSize: 14 }}>English</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  color: "#06b6d4",
                  fontSize: 16,
                }}
              >
                ↕
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid #3b82f6",
                  borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>🇪🇸</span>
                <span style={{ color: "white", fontSize: 14 }}>Spanish</span>
              </div>
            </div>

            {/* Supported languages */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: "auto",
                gap: 8,
              }}
            >
              <span style={{ color: "#6b7280", fontSize: 11 }}>
                Also supports:
              </span>
              <div style={{ display: "flex", gap: 8, fontSize: 18 }}>
                <span>🇫🇷</span>
                <span>🇩🇪</span>
                <span>🇮🇹</span>
                <span>🇵🇹</span>
                <span>🇨🇳</span>
                <span>🇯🇵</span>
              </div>
            </div>
          </div>

          {/* Main translation area */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: 24,
              backgroundColor: "rgba(26, 26, 36, 0.6)",
              borderRadius: 16,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  color: "#06b6d4",
                }}
              >
                Real-Time Voice Translation
              </span>
            </div>

            {/* Translation display */}
            <div
              style={{
                display: "flex",
                flex: 1,
                gap: 24,
              }}
            >
              {/* Speaker 1 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  padding: 20,
                  backgroundColor: "rgba(6, 182, 212, 0.05)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: 18 }}>🇺🇸</span>
                  <span style={{ color: "#06b6d4", fontSize: 14 }}>
                    English Speaker
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: "#06b6d4",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: "white", fontSize: 15 }}>
                      Hello! Welcome to our hotel.
                    </span>
                  </div>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: "#06b6d4",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: "white", fontSize: 15 }}>
                      Your room is ready on the 5th floor.
                    </span>
                  </div>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: "rgba(6, 182, 212, 0.2)",
                      border: "1px solid #06b6d4",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: "white", fontSize: 15 }}>
                      Do you need help with luggage?
                    </span>
                  </div>
                </div>
              </div>

              {/* Center divider with arrows */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  color: "#6b7280",
                }}
              >
                <span style={{ fontSize: 20 }}>→</span>
                <span style={{ fontSize: 20 }}>←</span>
              </div>

              {/* Speaker 2 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  padding: 20,
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: 18 }}>🇪🇸</span>
                  <span style={{ color: "#3b82f6", fontSize: 14 }}>
                    Spanish Speaker
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: "#3b82f6",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: "white", fontSize: 15 }}>
                      Hola! Bienvenido a nuestro hotel.
                    </span>
                  </div>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: "#3b82f6",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: "white", fontSize: 15 }}>
                      Su habitacion esta lista en el 5to piso.
                    </span>
                  </div>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: "rgba(59, 130, 246, 0.2)",
                      border: "1px solid #3b82f6",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ color: "white", fontSize: 15 }}>
                      Necesita ayuda con el equipaje?
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recording indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 24,
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                  fontSize: 24,
                }}
              >
                🎤
              </div>
              <span style={{ color: "#9ca3af", fontSize: 14 }}>
                Tap to speak or use voice activation
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 16,
            color: "#6b7280",
            fontSize: 12,
          }}
        >
          Powered by MachineMind | Break language barriers instantly
        </div>
      </div>,
      {
        width: 1280,
        height: 720,
      },
    );
  } catch (error) {
    console.error("Error generating desktop screenshot:", error);
    return NextResponse.json(
      { error: "Failed to generate screenshot" },
      { status: 500 },
    );
  }
}
