import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errorParam = searchParams.get("error");

  // Vercel sits behind a load balancer — use x-forwarded-host to build the
  // redirect URL so we don't bounce users back to localhost.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base =
    !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  if (errorParam) {
    const desc = searchParams.get("error_description") || errorParam;
    const friendly = mapProviderError(desc);
    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(friendly)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error, data } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const friendly = mapProviderError(error.message || "auth_failed");
    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(friendly)}`
    );
  }

  // Capture provider token server-side. Supabase PKCE exposes
  // session.provider_token ONLY on this initial exchange — subsequent
  // getSession() calls (server or browser) return it as null. If this fails
  // the client-side ProviderTokenCapture hook is still a fallback.
  const session = data?.session;
  if (session?.provider_token) {
    try {
      const { getSupabaseServer } = await import("@/lib/supabase");
      const db = getSupabaseServer();
      const provider =
        (session.user?.app_metadata?.provider as string | undefined) || "";
      const platform: "linkedin" | "x" | null =
        provider === "linkedin_oidc" || provider === "linkedin"
          ? "linkedin"
          : provider === "x" || provider === "twitter"
            ? "x"
            : null;

      if (platform) {
        const identity =
          (session.user?.user_metadata as Record<string, unknown>) || {};
        const accountId =
          (identity.sub as string | undefined) ||
          (identity.provider_id as string | undefined) ||
          session.user.id;
        const accountName =
          (identity.full_name as string | undefined) ||
          (identity.name as string | undefined) ||
          (identity.user_name as string | undefined) ||
          session.user.email ||
          "Unknown";
        const ttlMs =
          platform === "linkedin"
            ? 60 * 24 * 60 * 60 * 1000
            : 2 * 60 * 60 * 1000;

        // Defensive delete-then-insert: covers any residual legacy partial
        // unique indexes. With the non-partial (user_id, platform) index this
        // is idempotent and equivalent to an upsert.
        await db
          .from("oauth_connections")
          .delete()
          .eq("user_id", session.user.id)
          .eq("platform", platform);

        const { error: insertError } = await db
          .from("oauth_connections")
          .insert({
            user_id: session.user.id,
            platform,
            account_id: String(accountId),
            account_name: String(accountName),
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token ?? null,
            token_expires_at: new Date(Date.now() + ttlMs).toISOString(),
            scopes:
              platform === "linkedin"
                ? ["openid", "profile", "email", "w_member_social"]
                : ["tweet.read", "tweet.write", "users.read", "offline.access"],
            metadata: {
              avatar_url:
                (identity.avatar_url as string | undefined) ??
                (identity.picture as string | undefined) ??
                null,
              email: session.user.email,
            },
            status: "active",
          });

        if (insertError) {
          console.error(
            "[auth/callback] Failed to insert oauth_connection:",
            insertError.message
          );
        } else {
          console.log(
            `[auth/callback] Saved ${platform} token for user ${session.user.id}`
          );
        }
      } else if (provider) {
        console.log(
          `[auth/callback] provider_token present but provider='${provider}' not LinkedIn/X — skipping`
        );
      }
    } catch (err) {
      console.error("[auth/callback] Failed to save provider token:", err);
      // Non-fatal — user can still reconnect later via Settings.
    }
  } else if (session) {
    const provider =
      (session.user?.app_metadata?.provider as string | undefined) || "";
    console.log(
      `[auth/callback] no provider_token on initial exchange (provider=${provider || "none"})`
    );
  }

  return NextResponse.redirect(`${base}${next}`);
}

// Map raw provider error messages to user-friendly guidance. Keeps the raw
// text as fallback so we never hide information entirely.
function mapProviderError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("email") && msg.includes("external provider")) {
    return "X connection failed: X didn't share your email address. Go to developer.x.com → your app → User Authentication Settings → enable 'Request email from users', then try again.";
  }
  return raw;
}
