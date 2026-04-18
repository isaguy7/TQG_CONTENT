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
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const friendly = mapProviderError(error.message || "auth_failed");
    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(friendly)}`
    );
  }

  // NOTE: we intentionally do NOT try to persist session.provider_token here.
  // Supabase only exposes provider_token in the browser-side session payload,
  // so the server-side exchange returns it as null. The client-side hook in
  // Settings picks it up via onAuthStateChange and POSTs to
  // /api/auth/save-token.
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
