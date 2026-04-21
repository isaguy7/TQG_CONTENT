import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * GET /api/figures/slug-available?slug=foo
 *
 * Returns { available, reason? }. Used by the figure create form to
 * give live availability feedback as the user types a slug.
 *
 * The uniqueness check does NOT filter deleted_at — soft-deleted
 * figures still "own" their slug. An undelete flow (future) would
 * otherwise collide.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json(
      { available: false, reason: "Missing slug" },
      { status: 400 }
    );
  }

  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ available: false, reason: "Invalid format" });
  }

  const db = createClient();
  const { data, error } = await db
    .from("islamic_figures")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { available: false, reason: "Lookup failed" },
      { status: 500 }
    );
  }

  if (data) {
    return NextResponse.json({ available: false, reason: "Already used" });
  }

  return NextResponse.json({ available: true });
}
