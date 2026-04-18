import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";

const ROLE_COOKIE = "tqg_role";
const ROLE_COOKIE_TTL_SEC = 60 * 60; // 1 hour — balances staleness vs DB load.

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

  const isPublicPath =
    pathname === "/login" ||
    pathname === "/pending-approval" ||
    pathname.startsWith("/api/");

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

  // Authenticated users: gate on approval status. Signed-in users on
  // /login are allowed (they may be re-authing). Anything else requires
  // role ∈ {admin,member}; 'pending' goes to /pending-approval.
  if (user && !isPublicPath) {
    // Read cached role cookie. Empty or missing → re-query the profiles
    // table through the service-role client so RLS doesn't hide the row.
    let role = req.cookies.get(ROLE_COOKIE)?.value || null;
    if (!role) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        try {
          const admin = createSbClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceKey,
            { auth: { persistSession: false } }
          );
          const { data } = await admin
            .from("user_profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
          role = (data as { role?: string } | null)?.role || "pending";
        } catch {
          // If the table doesn't exist yet (migration not applied) treat
          // all signed-in users as members so we don't lock anyone out.
          role = "member";
        }
        res.cookies.set(ROLE_COOKIE, role, {
          maxAge: ROLE_COOKIE_TTL_SEC,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      } else {
        // Service role missing: fail open on role so local dev without the
        // admin key still works.
        role = "member";
      }
    }

    if (role === "pending" || role === "rejected") {
      const redirectUrl = new URL("/pending-approval", req.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
