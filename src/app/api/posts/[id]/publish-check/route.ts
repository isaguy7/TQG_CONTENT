import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { checkPublishGate } from "@/lib/publish-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/**
 * GET /api/posts/[id]/publish-check
 *
 * Returns { ready_to_publish, blockers[] }. Used by the editor to
 * proactively disable publish-adjacent UI (status dropdown options
 * for 'scheduled' / 'published') before the user tries and hits the
 * PATCH rejection. Also future-used by §13's scheduler before flipping
 * posts to 'published'.
 *
 * Match-all-at-once semantics (see src/lib/publish-gate.ts): returns
 * the complete blocker list, not short-circuiting, so the UI can
 * render everything that needs to be fixed.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = createClient();

  // Ownership check: same pattern as sibling routes.
  const { data: post } = await db
    .from("posts")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await checkPublishGate(db, params.id);
  return NextResponse.json(result);
}
