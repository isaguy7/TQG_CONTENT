import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string; hadithId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id) || !isUuid(params.hadithId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const relevanceNote: string | null = body?.relevance_note ?? null;
  const db = getSupabaseServer();
  const { error } = await db
    .from("figure_hadith_refs")
    .update({ relevance_note: relevanceNote })
    .eq("figure_id", params.id)
    .eq("hadith_corpus_id", params.hadithId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id) || !isUuid(params.hadithId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = getSupabaseServer();
  const { error } = await db
    .from("figure_hadith_refs")
    .delete()
    .eq("figure_id", params.id)
    .eq("hadith_corpus_id", params.hadithId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
