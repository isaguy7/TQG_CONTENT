import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import {
  assertPublishable,
  PublishGateError,
  publishGateErrorBody,
} from "@/lib/publish-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const db = getSupabaseServer();
  const { data: post, error } = await db
    .from("posts")
    .select("*")
    .eq("id", params.id)
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

/**
 * PATCH /api/posts/[id]. Any mutation that sets status='ready' runs
 * through assertPublishable first (Node mirror of the DB trigger).
 * UI errors short-circuit here with a 422 and the list of unverified
 * hadith, instead of surfacing a raw DB trigger error later.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  let body: {
    title?: string;
    final_content?: string | null;
    status?: "idea" | "drafting" | "review" | "ready" | "scheduled" | "published";
    platform?: string;
    figure_id?: string | null;
    hook_selected?: string | null;
    image_url?: string | null;
    image_rationale?: string | null;
    scheduled_for?: string | null;
    topic_tags?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status === "ready") {
    try {
      await assertPublishable(params.id);
    } catch (err) {
      if (err instanceof PublishGateError) {
        return NextResponse.json(publishGateErrorBody(err), { status: 422 });
      }
      throw err;
    }
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const writable: (keyof typeof body)[] = [
    "title",
    "final_content",
    "status",
    "platform",
    "figure_id",
    "hook_selected",
    "image_url",
    "image_rationale",
    "scheduled_for",
    "topic_tags",
  ];
  for (const k of writable) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  if (body.status === "published") {
    update.published_at = new Date().toISOString();
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("posts")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    // DB trigger backstop — if the Node gate missed a case, the trigger
    // still rejects. Surface it cleanly.
    if (/unverified hadith/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "publish_gate",
          message: error.message,
          unverified: [],
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ post: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = getSupabaseServer();
  const { error } = await db.from("posts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
