import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const VERSE_KEY_RE = /^(\d{1,3}):(\d{1,3})$/;

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const db = createClient();
  const { data: refs, error } = await db
    .from("figure_quran_refs")
    .select(
      "figure_id,verse_key,surah,ayah,relevance_note,tafseer_note,created_at"
    )
    .eq("figure_id", params.id)
    .order("surah", { ascending: true })
    .order("ayah", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const keys = (refs || []).map((r) => r.verse_key);
  let ayahRows: Array<Record<string, unknown>> = [];
  if (keys.length > 0) {
    const { data } = await db
      .from("quran_cache")
      .select("verse_key,surah,ayah,text_uthmani,translation_en")
      .in("verse_key", keys);
    ayahRows = data || [];
  }
  const byKey = new Map<string, Record<string, unknown>>();
  for (const a of ayahRows) byKey.set(a.verse_key as string, a);

  const items = (refs || []).map((r) => ({
    ...r,
    ayah_data: byKey.get(r.verse_key) || null,
  }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const verseKey: string = (body?.verse_key || "").trim();
  const m = verseKey.match(VERSE_KEY_RE);
  if (!m) {
    return NextResponse.json(
      { error: "verse_key must look like '9:40'" },
      { status: 400 }
    );
  }
  const surah = Number(m[1]);
  const ayah = Number(m[2]);
  if (surah < 1 || surah > 114 || ayah < 1) {
    return NextResponse.json({ error: "Out of range" }, { status: 400 });
  }
  const relevanceNote: string | null = body?.relevance_note ?? null;
  const tafseerNote: string | null = body?.tafseer_note ?? null;
  const db = createClient();
  const { error } = await db.from("figure_quran_refs").upsert(
    {
      figure_id: params.id,
      verse_key: verseKey,
      surah,
      ayah,
      relevance_note: relevanceNote,
      tafseer_note: tafseerNote,
    },
    { onConflict: "figure_id,verse_key" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
