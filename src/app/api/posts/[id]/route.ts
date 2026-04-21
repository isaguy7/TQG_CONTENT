import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { recordPublished } from "@/lib/gap-alerts";
import { isUuid } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import { checkPublishGate } from "@/lib/publish-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = createClient();
  const { data: post, error } = await db
    .from("posts")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: refs } = await db
    .from("post_hadith_refs")
    .select(
      `
      position,
      hadith_verifications (
        id,
        reference_text,
        sunnah_com_url,
        narrator,
        verified,
        verification_notes
      )
    `
    )
    .eq("post_id", params.id)
    .order("position", { ascending: true });

  return NextResponse.json({
    post,
    hadith_refs: (refs || []).map((r) => r.hadith_verifications).filter(Boolean),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    title?: string;
    final_content?: string | null;
    content_html?: string | null;
    content_json?: unknown;
    status?: "idea" | "draft" | "scheduled" | "published" | "failed" | "archived";
    platform?: string;
    platform_versions?: Record<string, unknown>;
    figure_id?: string | null;
    hook_selected?: string | null;
    image_url?: string | null;
    image_rationale?: string | null;
    scheduled_for?: string | null;
    topic_tags?: string[];
    quran_refs?: unknown;
    performance?: unknown;
    labels?: string[];
    deleted_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const writable: (keyof typeof body)[] = [
    "title",
    "final_content",
    "content_html",
    "content_json",
    "status",
    "platform",
    "platform_versions",
    "figure_id",
    "hook_selected",
    "image_url",
    "image_rationale",
    "scheduled_for",
    "topic_tags",
    "quran_refs",
    "performance",
    "labels",
    "deleted_at",
  ];
  for (const k of writable) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  if (body.status === "published") {
    update.published_at = new Date().toISOString();
  }

  const db = createClient();

  // Publish-gate — refuse status transitions to scheduled/published
  // when the post has unverified hadith refs. Checked before the
  // UPDATE so a blocked transition never mutates the row. M1 reality:
  // corpus picker auto-verifies, so the gate is always pass for
  // in-spec flows; this is defense-in-depth for §9's AI suggestions.
  if (body.status === "scheduled" || body.status === "published") {
    const gate = await checkPublishGate(db, params.id);
    if (!gate.ready_to_publish) {
      return NextResponse.json(
        { error: "PUBLISH_GATE_BLOCKED", blockers: gate.blockers },
        { status: 400 }
      );
    }
  }

  // Heuristic — an "editor save" is any PATCH that carries canonical
  // content_json (even null). Metadata-only updates (status, labels,
  // scheduled_for, etc.) skip the version bump and post_versions insert.
  // Variant saves push to platform_versions only; canonical content_*
  // stays untouched so they also skip history (variants are overrides,
  // not independent history streams).
  const isEditorSave = Object.prototype.hasOwnProperty.call(
    body,
    "content_json"
  );

  let currentVersion = 0;
  let organizationId: string | null = null;
  if (isEditorSave) {
    const { data: pre } = await db
      .from("posts")
      .select("version, organization_id")
      .eq("id", params.id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    currentVersion = (pre?.version as number | null) ?? 0;
    organizationId = (pre?.organization_id as string | null) ?? null;
    update.version = currentVersion + 1;
  }

  const { data, error } = await db
    .from("posts")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (isEditorSave && organizationId) {
    // Append to immutable history. Sequential after the UPDATE rather
    // than wrapped in a transaction (supabase-js doesn't expose raw
    // TXs); a failed insert here leaves posts.version ahead of the
    // latest history row, which is recoverable on the next save.
    const { error: versionErr } = await db.from("post_versions").insert({
      post_id: params.id,
      organization_id: organizationId,
      version: currentVersion + 1,
      content: body.final_content ?? null,
      content_html: body.content_html ?? null,
      content_json: body.content_json ?? null,
      saved_by: auth.user.id,
    });
    if (versionErr) {
      // Log only — never fail the PATCH. prune_post_versions will catch
      // up on the next successful insert.
      console.error("[posts PATCH] post_versions insert failed", versionErr);
    }
  }

  if (body.status === "published") {
    try {
      await recordPublished(params.id);
    } catch {
      // Non-critical; don't fail the PATCH.
    }
  }

  return NextResponse.json({ post: data });
}

/**
 * DELETE /api/posts/[id]
 *   default → soft delete: sets deleted_at = now()
 *   ?permanent=true → hard delete (only callable from the trash UI)
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = createClient();
  const permanent = req.nextUrl.searchParams.get("permanent") === "true";
  if (permanent) {
    const { error } = await db
      .from("posts")
      .delete()
      .eq("id", params.id)
      .eq("user_id", auth.user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, permanent: true });
  }
  const { data, error } = await db
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, post: data });
}
