import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINKEDIN_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // ~60 days
const X_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (X OAuth2 default)

type Body = {
  provider: string;
  provider_token: string;
  provider_refresh_token?: string | null;
  expires_in?: number | null;
  identity?: Record<string, unknown> | null;
};

function detectPlatform(provider: string): "linkedin" | "x" | null {
  if (!provider) return null;
  if (provider === "linkedin_oidc" || provider === "linkedin") return "linkedin";
  if (provider === "x" || provider === "twitter") return "x";
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const user = auth.user;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.provider_token || !body.provider) {
    return NextResponse.json(
      { error: "provider and provider_token are required" },
      { status: 400 }
    );
  }

  const platform = detectPlatform(body.provider);
  if (!platform) {
    return NextResponse.json(
      { error: `Unsupported provider: ${body.provider}` },
      { status: 400 }
    );
  }

  const ttlMs =
    typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in * 1000
      : platform === "linkedin"
        ? LINKEDIN_TOKEN_TTL_MS
        : X_TOKEN_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const identity = body.identity || (user.user_metadata as Record<string, unknown>) || {};
  const accountId =
    (identity.sub as string | undefined) ||
    (identity.provider_id as string | undefined) ||
    (identity.user_name as string | undefined) ||
    user.id;
  const accountName =
    (identity.full_name as string | undefined) ||
    (identity.name as string | undefined) ||
    (identity.user_name as string | undefined) ||
    user.email ||
    "Unknown account";

  const scopes =
    platform === "linkedin"
      ? ["openid", "profile", "email", "w_member_social"]
      : ["tweet.read", "tweet.write", "users.read", "offline.access"];

  const db = getSupabaseServer();
  // OAuth callbacks always represent the signed-in member — LinkedIn Pages
  // are added as separate rows via /api/auth/linkedin-pages.
  //
  // Drop any prior personal row before inserting so a re-login lands
  // cleanly even if LinkedIn handed us a different account_id (rare, but
  // the partial unique `(user, platform) where account_type='personal'`
  // would otherwise reject the insert).
  await db
    .from("oauth_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", platform)
    .eq("account_type", "personal");

  const { error } = await db.from("oauth_connections").insert({
    user_id: user.id,
    platform,
    account_type: "personal",
    account_id: accountId,
    account_name: accountName,
    access_token: body.provider_token,
    refresh_token: body.provider_refresh_token ?? null,
    token_expires_at: expiresAt,
    scopes,
    metadata: {
      avatar_url: identity.avatar_url ?? identity.picture ?? null,
      email: user.email,
    },
    status: "active",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, platform });
}
