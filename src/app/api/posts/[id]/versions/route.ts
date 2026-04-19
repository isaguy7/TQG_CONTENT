import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireRole, AuthError, OrgError } from "@/lib/org/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[id]/versions
 *
 * Lists post_versions rows for the given post, newest first. Gated by
 * org membership (viewer+) on the post's organization — not the
 * requester's active org, so the check still works if the user is
 * viewing a post from a non-active org they're also a member of.
 *
 * The 50-version cap is enforced by the prune_post_versions trigger on
 * insert, so the response will never exceed 50 rows. No pagination.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = createClient();

  // Resolve the post's organization_id before the role check so we
  // validate membership against the right org.
  const { data: post, error: postErr } = await db
    .from("posts")
    .select("organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await requireRole("viewer", {
      organizationId: post.organization_id as string,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: 401 });
    }
    if (err instanceof OrgError) {
      return NextResponse.json({ error: err.code }, { status: 403 });
    }
    throw err;
  }

  const { data, error } = await db
    .from("post_versions")
    .select(
      "id, version, content, content_html, content_json, saved_at, saved_by"
    )
    .eq("post_id", params.id)
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}
