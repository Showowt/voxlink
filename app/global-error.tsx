"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Entrevoz] Global error:", error);
  }, [error]);

  return (
    <html>
      <body style={{ backgroundColor: "#060810", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>⚠️</div>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                color: "#ffffff",
                marginBottom: "0.5rem",
              }}
            >
              Something went wrong
            </h2>
            <p style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>
              A critical error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#00DBA8",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.75rem",
                fontWeight: 500,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
