import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/refresh-role
 * Clears the `tqg_role` cookie so the middleware re-queries user_profiles
 * on the next navigation. Used by the pending-approval page ("check again
 * now that the admin approved me") and by the admin UI after promoting
 * themselves — otherwise the stale 'member' cookie would keep them out of
 * admin-only routes.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("tqg_role", "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
