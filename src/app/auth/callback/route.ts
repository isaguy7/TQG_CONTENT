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

  console.log("[auth/callback] provider_token present:", !!data?.session?.provider_token);
  console.log("[auth/callback] provider:", data?.session?.user?.app_metadata?.provider);

  if (data?.session?.provider_token) {
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const serviceDb = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const session = data.session;
    const provider = session.user?.app_metadata?.provider || "";
    const platform = provider === "linkedin_oidc" ? "linkedin" : provider === "x" ? "x" : null;

    if (platform) {
      const identity = (session.user?.user_metadata as Record<string, unknown>) || {};
      const accountId = String(identity.sub || identity.provider_id || session.user.id);
      const accountName = String(identity.full_name || identity.name || identity.user_name || session.user.email || "Unknown");
      const ttlMs = platform === "linkedin" ? 60 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;

      // Delete existing row first, then insert fresh
      await serviceDb.from("oauth_connections")
        .delete()
        .eq("user_id", session.user.id)
        .eq("platform", platform);

      const { error: insertErr } = await serviceDb.from("oauth_connections").insert({
        user_id: session.user.id,
        platform,
        account_id: accountId,
        account_name: accountName,
        access_token: session.provider_token,
        refresh_token: session.provider_refresh_token || null,
        token_expires_at: new Date(Date.now() + ttlMs).toISOString(),
        scopes: platform === "linkedin"
          ? ["openid", "profile", "email", "w_member_social"]
          : ["tweet.read", "tweet.write", "users.read", "offline.access"],
        metadata: { avatar_url: identity.avatar_url || identity.picture || null, email: session.user.email },
        status: "active",
      });

      console.log("[auth/callback] token save result:", insertErr ? insertErr.message : "SUCCESS for " + platform);
    }
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
