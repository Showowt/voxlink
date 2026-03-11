// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SIGNUP API - Email/Password Registration
// POST /api/auth/signup
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be less than 72 characters"),
  name: z.string().min(1).max(100).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST - Sign up with email/password
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = signupSchema.safeParse(body);

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

    const { email, password, name } = validation.data;

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

    // Sign up the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split("@")[0],
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/auth/callback`,
      },
    });

    if (error) {
      console.error("[Auth Signup]", error);

      // Handle specific error cases
      if (error.message.includes("already registered")) {
        return NextResponse.json(
          {
            data: null,
            error: "Email already in use",
            message:
              "An account with this email already exists. Please sign in instead.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          data: null,
          error: error.message,
          message: "Failed to create account",
        },
        { status: 400 },
      );
    }

    // Check if email confirmation is required
    const needsConfirmation = !data.session;

    return NextResponse.json(
      {
        data: {
          user: data.user
            ? {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.name,
              }
            : null,
          session: data.session
            ? {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
              }
            : null,
          needsConfirmation,
        },
        error: null,
        message: needsConfirmation
          ? "Please check your email to confirm your account"
          : "Account created successfully",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[Auth Signup] Unexpected error:", err);

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
