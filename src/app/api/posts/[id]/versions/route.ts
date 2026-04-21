import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[id]/versions
 *
 * Lists post_versions rows for the given post, newest first. Gated by
 * org membership (any role) on the post's organization — so users with
 * multi-org membership viewing a non-active-org post still pass the
 * gate.
 *
 * Auth pattern — inline instead of `requireRole` from @/lib/org/server
 * because the `organization_members` RLS policy (`org_members_read_peers`)
 * is recursively self-referential: a SELECT on the table is gated by a
 * sub-SELECT on the same table, which the session client can't resolve
 * even for the user's own row. Admin client bypasses RLS, so we do the
 * membership check server-side with a service-role query.
 *
 * TODO: when more routes need org gating (§9+ AI assistant, §10+
 * platform adapters), fix `requireRole` to use admin client for
 * membership resolution while preserving the session-client auth step.
 * Until then this inline block is the canonical pattern.
 *
 * The 50-version cap is enforced by the prune_post_versions trigger on
 * insert, so the response will never exceed 50 rows. No pagination.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Session-scoped auth — pulls user from the request cookie.
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  // Admin client for everything else — bypasses RLS (including the
  // recursive organization_members policy that blocks session clients).
  const db = createClient();

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

  const { data: membership } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", post.organization_id as string)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "ORG_FORBIDDEN" }, { status: 403 });
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
