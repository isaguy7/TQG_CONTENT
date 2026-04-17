import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export async function GET() {
  const anthropicConnected = hasEnv("ANTHROPIC_API_KEY");
  const supabaseConnected =
    hasEnv("NEXT_PUBLIC_SUPABASE_URL") &&
    (hasEnv("SUPABASE_SERVICE_ROLE_KEY") ||
      hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  const typefullyConnected = hasEnv("TYPEFULLY_API_KEY");
  const unsplashConnected = hasEnv("UNSPLASH_ACCESS_KEY");
  const linkedinConnected = hasEnv("LINKEDIN_ACCESS_TOKEN");
  const metaConnected = hasEnv("META_ACCESS_TOKEN");

  const integrations = {
    supabase: {
      connected: supabaseConnected,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
      service_role: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },
    anthropic: {
      connected: anthropicConnected,
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
    },
    typefully: {
      connected: typefullyConnected,
      social_set: hasEnv("TYPEFULLY_SOCIAL_SET_ID"),
    },
    unsplash: {
      connected: unsplashConnected,
    },
    linkedin: {
      connected: linkedinConnected,
      oauth_ready: false,
    },
    meta: {
      connected: metaConnected,
      oauth_ready: false,
    },
    whisperx: {
      model: process.env.WHISPERX_MODEL?.trim() || "large-v3-turbo",
      device: process.env.WHISPERX_DEVICE?.trim() || "cuda",
      batchSize: Number(process.env.WHISPERX_BATCH_SIZE) || 4,
    },
  };

  // Helpful server-side log so the user can confirm which keys are detected.
  if (process.env.NODE_ENV !== "production") {
    console.log("[integrations] status:", {
      supabase: supabaseConnected,
      anthropic: anthropicConnected,
      typefully: typefullyConnected,
      unsplash: unsplashConnected,
      linkedin: linkedinConnected,
      meta: metaConnected,
    });
  }

  return NextResponse.json({ integrations });
}
