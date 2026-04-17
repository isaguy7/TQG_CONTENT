import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export type QuranRef = {
  surah: number;
  ayah: number;
  verse_key: string;
  text_uthmani?: string;
  translation_en?: string | null;
  tafseer_note?: string;
};

function sanitizeRef(ref: unknown): QuranRef | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  const surah = Number(r.surah);
  const ayah = Number(r.ayah);
  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
  if (surah < 1 || surah > 114 || ayah < 1) return null;
  return {
    surah,
    ayah,
    verse_key: `${surah}:${ayah}`,
    text_uthmani: typeof r.text_uthmani === "string" ? r.text_uthmani : undefined,
    translation_en:
      typeof r.translation_en === "string" ? r.translation_en : null,
    tafseer_note:
      typeof r.tafseer_note === "string" ? r.tafseer_note : undefined,
  };
}

async function getCurrentRefs(postId: string): Promise<QuranRef[]> {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("posts")
    .select("quran_refs")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data?.quran_refs as unknown) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeRef).filter((r): r is QuranRef => r !== null);
}

async function saveRefs(
  postId: string,
  refs: QuranRef[]
): Promise<QuranRef[]> {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("posts")
    .update({ quran_refs: refs, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .select("quran_refs")
    .single();
  if (error) throw new Error(error.message);
  const raw = (data?.quran_refs as unknown) || [];
  return Array.isArray(raw)
    ? raw.map(sanitizeRef).filter((r): r is QuranRef => r !== null)
    : [];
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const refs = await getCurrentRefs(params.id);
    return NextResponse.json({ refs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  let body: { ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const ref = sanitizeRef(body.ref);
  if (!ref) {
    return NextResponse.json({ error: "Invalid ref" }, { status: 400 });
  }
  try {
    const current = await getCurrentRefs(params.id);
    if (current.some((r) => r.verse_key === ref.verse_key)) {
      return NextResponse.json({ refs: current });
    }
    const next = [...current, ref];
    const saved = await saveRefs(params.id, next);
    return NextResponse.json({ refs: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let body: { verse_key?: string; tafseer_note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.verse_key) {
    return NextResponse.json({ error: "Missing verse_key" }, { status: 400 });
  }
  try {
    const current = await getCurrentRefs(params.id);
    const next = current.map((r) =>
      r.verse_key === body.verse_key
        ? { ...r, tafseer_note: body.tafseer_note || undefined }
        : r
    );
    const saved = await saveRefs(params.id, next);
    return NextResponse.json({ refs: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const verseKey = req.nextUrl.searchParams.get("verse_key");
  if (!verseKey) {
    return NextResponse.json({ error: "Missing verse_key" }, { status: 400 });
  }
  try {
    const current = await getCurrentRefs(params.id);
    const next = current.filter((r) => r.verse_key !== verseKey);
    const saved = await saveRefs(params.id, next);
    return NextResponse.json({ refs: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
