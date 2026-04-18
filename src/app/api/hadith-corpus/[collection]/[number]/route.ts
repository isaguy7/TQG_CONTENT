import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";

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

  const db = createClient();
  // (collection, hadith_number) is not unique — Sahih Muslim has thousands of
  // sub-narrations that share the same hadith_number. Return every match and
  // expose the first one for back-compat callers that expect `hadith`.
  const { data, error } = await db
    .from("hadith_corpus")
    .select("*")
    .eq("collection", collection)
    .eq("hadith_number", hadithNumber)
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ hadith: data[0], all: data });
}
