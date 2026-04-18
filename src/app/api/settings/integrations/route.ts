import { NextResponse } from "next/server";
import { listConnections } from "@/lib/oauth-connections";
import { getCurrentUser } from "@/lib/supabase/server";

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
  const metaConnected = hasEnv("META_ACCESS_TOKEN");

  // Per-user OAuth state lives in oauth_connections; resolve the current
  // user (if any) and look up LinkedIn / X connection rows.
  const user = await getCurrentUser();
  const conns = user ? await listConnections(user.id) : [];
  const now = Date.now();
  const findPersonal = (platform: "linkedin" | "x") => {
    const c = conns.find(
      (x) => x.platform === platform && x.account_type === "personal"
    );
    if (!c) return null;
    const expired = c.token_expires_at
      ? new Date(c.token_expires_at).getTime() <= now
      : false;
    return {
      account_name: c.account_name,
      account_type: c.account_type,
      status: expired && c.status === "active" ? "expired" : c.status,
      token_expires_at: c.token_expires_at,
    };
  };
  const linkedinConn = findPersonal("linkedin");
  const xConn = findPersonal("x");
  const linkedinOrgs = conns
    .filter((c) => c.platform === "linkedin" && c.account_type === "organization")
    .map((c) => ({
      id: c.id,
      account_id: c.account_id,
      account_name: c.account_name,
      status: c.status,
    }));

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
    pexels: {
      connected: hasEnv("PEXELS_API_KEY"),
    },
    linkedin: {
      connected: !!linkedinConn && linkedinConn.status === "active",
      oauth: linkedinConn,
      organizations: linkedinOrgs,
    },
    x: {
      connected: !!xConn && xConn.status === "active",
      oauth: xConn,
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

  return NextResponse.json({ integrations });
}
