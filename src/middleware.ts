import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const pathname = req.nextUrl.pathname;

  // CRITICAL: skip all Supabase calls on /auth/callback. The route handler
  // owns the cookie/session for that request (it calls exchangeCodeForSession
  // with the PKCE verifier cookie). Running getUser() here would pass the
  // still-pre-exchange session through refreshSession, which can rotate or
  // drop the verifier cookie mid-flight and surface as "OAuth state not
  // found" on the second leg of the redirect. Let the callback run on its
  // own, untouched.
  if (pathname.startsWith("/auth/callback")) {
    return res;
  }

  const isPublicPath = pathname === "/login" || pathname.startsWith("/api/");

  // If Supabase isn't configured (e.g. fresh local checkout) don't block —
  // surface env errors in the UI instead of trapping the user on /login.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        // Mirror cookies onto BOTH the request and the response, matching
        // the @supabase/ssr Next.js reference implementation. This keeps
        // the rest of the middleware chain (and the server component render
        // that follows) in sync with any refreshed session cookies.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set({ name, value, ...options });
          });
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
