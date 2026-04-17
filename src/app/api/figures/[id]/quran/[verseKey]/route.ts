import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string; verseKey: string } };

const VERSE_KEY_RE = /^(\d{1,3}):(\d{1,3})$/;

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const verseKey = decodeURIComponent(params.verseKey);
  if (!VERSE_KEY_RE.test(verseKey)) {
    return NextResponse.json({ error: "Invalid verse key" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if ("relevance_note" in (body || {}))
    patch.relevance_note = body.relevance_note;
  if ("tafseer_note" in (body || {})) patch.tafseer_note = body.tafseer_note;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }
  const db = getSupabaseServer();
  const { error } = await db
    .from("figure_quran_refs")
    .update(patch)
    .eq("figure_id", params.id)
    .eq("verse_key", verseKey);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const verseKey = decodeURIComponent(params.verseKey);
  if (!VERSE_KEY_RE.test(verseKey)) {
    return NextResponse.json({ error: "Invalid verse key" }, { status: 400 });
  }
  const db = getSupabaseServer();
  const { error } = await db
    .from("figure_quran_refs")
    .delete()
    .eq("figure_id", params.id)
    .eq("verse_key", verseKey);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
