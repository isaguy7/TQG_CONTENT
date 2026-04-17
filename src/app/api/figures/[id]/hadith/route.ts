import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = getSupabaseServer();
  const { data: refs, error } = await db
    .from("figure_hadith_refs")
    .select("figure_id,hadith_corpus_id,relevance_note,created_at")
    .eq("figure_id", params.id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = (refs || []).map((r) => r.hadith_corpus_id);
  let hadithRows: Array<Record<string, unknown>> = [];
  if (ids.length > 0) {
    const { data } = await db
      .from("hadith_corpus")
      .select(
        "id,collection,collection_name,hadith_number,narrator,english_text,arabic_text,grade,sunnah_com_url"
      )
      .in("id", ids);
    hadithRows = data || [];
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const h of hadithRows) byId.set(h.id as string, h);
  const items = (refs || []).map((r) => ({
    ...r,
    hadith: byId.get(r.hadith_corpus_id) || null,
  }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const hadithCorpusId: string | undefined = body?.hadith_corpus_id;
  const relevanceNote: string | null = body?.relevance_note ?? null;
  if (!isUuid(hadithCorpusId)) {
    return NextResponse.json(
      { error: "hadith_corpus_id required" },
      { status: 400 }
    );
  }
  const db = getSupabaseServer();
  const { error } = await db.from("figure_hadith_refs").upsert(
    {
      figure_id: params.id,
      hadith_corpus_id: hadithCorpusId,
      relevance_note: relevanceNote,
    },
    { onConflict: "figure_id,hadith_corpus_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
