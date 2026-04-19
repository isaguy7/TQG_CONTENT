import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient } from "@supabase/supabase-js";

const ROLE_COOKIE = "tqg_role";
const ACTIVE_ORG_COOKIE = "tqg_active_org";
const PROFILE_COOKIE_TTL_SEC = 60 * 60; // 1 hour — balances staleness vs DB load.

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

  const isAuthPath =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/pending-approval";
  const isOnboardingPath = pathname === "/onboarding";
  const isApiPath = pathname.startsWith("/api/");
  const isPublicPath = isAuthPath || isApiPath;

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

  // Unauthenticated: force to /login (preserve intended destination).
  if (!user && !isPublicPath) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated but visiting /login or /signup: kick back to home.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Authenticated: enforce role + active-org gate on non-public, non-API,
  // non-onboarding routes.
  if (user && !isPublicPath && !isOnboardingPath) {
    let role = req.cookies.get(ROLE_COOKIE)?.value || null;
    let activeOrg =
      req.cookies.get(ACTIVE_ORG_COOKIE)?.value || null;
    const needProfileRefresh = !role;

    if (needProfileRefresh) {
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
            .select("role, active_organization_id")
            .eq("user_id", user.id)
            .maybeSingle();
          const row =
            (data as {
              role?: string;
              active_organization_id?: string | null;
            } | null) ?? null;
          role = row?.role || "pending";
          activeOrg = row?.active_organization_id || "";
        } catch {
          // If user_profiles isn't queryable (migration not applied) treat
          // as member with no active org so /onboarding catches them.
          role = "member";
          activeOrg = "";
        }
        res.cookies.set(ROLE_COOKIE, role, {
          maxAge: PROFILE_COOKIE_TTL_SEC,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
        res.cookies.set(ACTIVE_ORG_COOKIE, activeOrg ?? "", {
          maxAge: PROFILE_COOKIE_TTL_SEC,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      } else {
        // Service role missing: fail open so local dev without the admin
        // key still works.
        role = "member";
        activeOrg = activeOrg ?? "";
      }
    }

    // Platform-level gate: pending/rejected users bounce to the waiting
    // page regardless of org state.
    if (role === "pending" || role === "rejected") {
      return NextResponse.redirect(new URL("/pending-approval", req.url));
    }

    // Org-level gate: approved users without an active org go to
    // onboarding to create or pick one.
    if (!activeOrg) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
