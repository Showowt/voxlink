import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY CODE API - VoxLink Access Gate
// Validates 4-digit access code and returns session token
// ═══════════════════════════════════════════════════════════════════════════════

// SECURITY: Access code from environment variable - NEVER hardcode
const ACCESS_CODE = process.env.VOXLINK_ACCESS_CODE;

if (!ACCESS_CODE) {
  console.error("CRITICAL: VOXLINK_ACCESS_CODE environment variable not set");
}

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    // Validate input
    if (!code || typeof code !== "string" || code.length !== 4) {
      return NextResponse.json(
        { valid: false, error: "Invalid code format" },
        { status: 400 },
      );
    }

    // Fail if ACCESS_CODE not configured
    if (!ACCESS_CODE) {
      return NextResponse.json(
        { valid: false, error: "Service not configured" },
        { status: 503 },
      );
    }

    // Check code
    if (code === ACCESS_CODE) {
      // Generate secure session token
      const token = randomBytes(32).toString("hex");

      return NextResponse.json({
        valid: true,
        token,
      });
    }

    return NextResponse.json(
      { valid: false, error: "Incorrect code" },
      { status: 401 },
    );
  } catch {
    return NextResponse.json(
      { valid: false, error: "Server error" },
      { status: 500 },
    );
  }
}
