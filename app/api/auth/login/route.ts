// ═══════════════════════════════════════════════════════════════════════════════
// AUTH LOGIN API - Email/Password Authentication
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST - Login with email/password
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          data: null,
          error: validation.error.issues[0].message,
          message: "Validation failed",
        },
        { status: 400 },
      );
    }

    const { email, password } = validation.data;

    // Create Supabase client
    const supabase = await createServerClient();

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: "Authentication not configured",
          message:
            "Supabase is not configured. Please add environment variables.",
        },
        { status: 503 },
      );
    }

    // Sign in the user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[Auth Login]", error);

      // Handle specific error cases
      if (error.message.includes("Invalid login credentials")) {
        return NextResponse.json(
          {
            data: null,
            error: "Invalid credentials",
            message: "The email or password you entered is incorrect.",
          },
          { status: 401 },
        );
      }

      if (error.message.includes("Email not confirmed")) {
        return NextResponse.json(
          {
            data: null,
            error: "Email not confirmed",
            message:
              "Please check your email and confirm your account before signing in.",
          },
          { status: 403 },
        );
      }

      return NextResponse.json(
        {
          data: null,
          error: error.message,
          message: "Failed to sign in",
        },
        { status: 400 },
      );
    }

    if (!data.user || !data.session) {
      return NextResponse.json(
        {
          data: null,
          error: "Authentication failed",
          message: "Unable to authenticate. Please try again.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            name:
              data.user.user_metadata?.name ??
              data.user.user_metadata?.full_name,
            avatar_url: data.user.user_metadata?.avatar_url,
          },
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        },
        error: null,
        message: "Signed in successfully",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[Auth Login] Unexpected error:", err);

    return NextResponse.json(
      {
        data: null,
        error: "Internal server error",
        message: "An unexpected error occurred. Please try again.",
      },
      { status: 500 },
    );
  }
}
