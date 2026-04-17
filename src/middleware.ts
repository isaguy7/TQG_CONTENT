import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Public routes: login page + all /api/* (internal use only). If we ever
  // expose a public API we can lock it down per-route.
  const pathname = req.nextUrl.pathname;
  if (pathname === "/login") return res;
  if (pathname.startsWith("/api/")) return res;

  // If Supabase isn't configured (e.g. during initial local setup) don't
  // block the app — let the user in and surface env errors in the UI.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return res;

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
