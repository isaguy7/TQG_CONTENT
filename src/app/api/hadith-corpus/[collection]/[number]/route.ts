import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { collection: string; number: string } };

/**
 * GET /api/hadith-corpus/[collection]/[number]
 * Look up a single hadith row by collection slug + hadith_number.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const collection = params.collection.trim().toLowerCase();
  const hadithNumber = Number(params.number);
  if (!collection || !Number.isFinite(hadithNumber)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("hadith_corpus")
    .select("*")
    .eq("collection", collection)
    .eq("hadith_number", hadithNumber)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ hadith: data });
}
