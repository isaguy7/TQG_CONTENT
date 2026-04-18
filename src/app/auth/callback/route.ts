import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINKEDIN_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // ~60 days
const X_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (X OAuth2 default)

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errorParam = searchParams.get("error");

  if (errorParam) {
    const desc = searchParams.get("error_description") || errorParam;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(desc)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        error?.message || "auth_failed"
      )}`
    );
  }

  // If the OAuth provider returned an access token, persist it in
  // oauth_connections so we can post on the user's behalf later.
  const session = data.session;
  const user = data.user;
  const providerToken = session.provider_token ?? null;
  const providerRefresh = session.provider_refresh_token ?? null;

  if (providerToken) {
    const platform = detectProviderPlatform(user.app_metadata?.provider);
    if (platform) {
      try {
        await persistOAuthConnection({
          userId: user.id,
          platform,
          accessToken: providerToken,
          refreshToken: providerRefresh,
          identity: user.user_metadata as Record<string, unknown>,
          email: user.email ?? null,
        });
      } catch (err) {
        // Logging only — the user is still signed in even if the post-token
        // capture fails. They can re-auth from Settings.
        console.error("[auth/callback] failed to persist provider token", err);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function detectProviderPlatform(
  provider: string | undefined
): "linkedin" | "x" | null {
  if (!provider) return null;
  if (provider === "linkedin_oidc" || provider === "linkedin") return "linkedin";
  if (provider === "x" || provider === "twitter") return "x";
  return null;
}

async function persistOAuthConnection(args: {
  userId: string;
  platform: "linkedin" | "x";
  accessToken: string;
  refreshToken: string | null;
  identity: Record<string, unknown> | null;
  email: string | null;
}) {
  const db = getSupabaseServer();
  const { userId, platform, accessToken, refreshToken, identity, email } = args;

  const ttl = platform === "linkedin" ? LINKEDIN_TOKEN_TTL_MS : X_TOKEN_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();

  const id = identity || {};
  const accountId =
    (id.sub as string | undefined) ||
    (id.provider_id as string | undefined) ||
    (id.user_name as string | undefined) ||
    userId;
  const accountName =
    (id.full_name as string | undefined) ||
    (id.name as string | undefined) ||
    (id.user_name as string | undefined) ||
    email ||
    "Unknown account";

  const scopes =
    platform === "linkedin"
      ? ["openid", "profile", "email", "w_member_social"]
      : ["tweet.read", "tweet.write", "users.read", "offline.access"];

  await db
    .from("oauth_connections")
    .upsert(
      {
        user_id: userId,
        platform,
        account_id: accountId,
        account_name: accountName,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        scopes,
        metadata: {
          avatar_url: id.avatar_url ?? id.picture ?? null,
          email,
        },
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );
}
