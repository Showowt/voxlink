import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Rate limit: 3 clones per minute per IP
const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= 3) return false;
  e.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice dubbing not configured" },
      { status: 503 },
    );
  }

  let body: { audioBase64: string; mimeType?: string; sessionKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { audioBase64, mimeType = "audio/webm", sessionKey } = body;

  if (!audioBase64 || audioBase64.length < 1000) {
    return NextResponse.json(
      { error: "Audio sample too short" },
      { status: 400 },
    );
  }

  // Check Supabase cache first (avoid re-cloning same voice)
  if (sessionKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        const sb = createClient(url, key);
        const { data } = await sb
          .from("voice_clones")
          .select("elevenlabs_voice_id")
          .eq("session_key", sessionKey)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (data?.elevenlabs_voice_id) {
          return NextResponse.json({
            voiceId: data.elevenlabs_voice_id,
            cached: true,
          });
        }
      }
    } catch {
      /* continue to create new clone */
    }
  }

  // Decode audio
  const audioBuffer = Buffer.from(audioBase64, "base64");

  // Build multipart form for ElevenLabs
  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  formData.append("files", audioBlob, "voice_sample.webm");
  formData.append("name", `entrevoz-${Date.now()}`);
  formData.append("description", "Entrevoz real-time voice clone");
  formData.append("remove_background_noise", "true");

  try {
    const cloneRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!cloneRes.ok) {
      const errText = await cloneRes.text();
      console.error("[VoiceClone] ElevenLabs error:", errText);
      return NextResponse.json(
        { error: "Clone failed", fallback: true },
        { status: 422 },
      );
    }

    const cloneData = await cloneRes.json();
    const voiceId = cloneData.voice_id;

    if (!voiceId) {
      return NextResponse.json(
        { error: "No voice ID returned", fallback: true },
        { status: 422 },
      );
    }

    // Cache in Supabase
    if (sessionKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) {
          const sb = createClient(url, key);
          await sb.from("voice_clones").upsert(
            {
              session_key: sessionKey,
              elevenlabs_voice_id: voiceId,
            },
            { onConflict: "session_key" },
          );
        }
      } catch {
        /* non-critical */
      }
    }

    return NextResponse.json({ voiceId, cached: false });
  } catch (e) {
    console.error("[VoiceClone] Unexpected error:", e);
    return NextResponse.json(
      { error: "Clone failed", fallback: true },
      { status: 500 },
    );
  }
}

// DELETE — clean up voice clone when call ends
export async function DELETE(req: NextRequest) {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) return NextResponse.json({ success: true });

  const { voiceId } = await req.json().catch(() => ({}) as { voiceId?: string });
  if (!voiceId) return NextResponse.json({ success: true });

  try {
    await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    });
  } catch {
    /* non-critical — ElevenLabs auto-expires clones */
  }

  return NextResponse.json({ success: true });
}
