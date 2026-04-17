import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { canonicalizeSunnahUrl, referenceFromUrl } from "@/lib/sunnah-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hadith — list all hadith verifications, newest first.
 * Optional ?verified=true|false to filter.
 */
export async function GET(req: NextRequest) {
  const db = getSupabaseServer();
  const verified = req.nextUrl.searchParams.get("verified");

  let query = db
    .from("hadith_verifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (verified === "true") query = query.eq("verified", true);
  if (verified === "false") query = query.eq("verified", false);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ hadith: data || [] });
}

/**
 * POST /api/hadith — create a new hadith reference from a sunnah.com URL.
 * V2: auto-marks verified=true because every corpus entry ships with a
 * canonical sunnah.com URL readers can follow for themselves.
 */
export async function POST(req: NextRequest) {
  let body: {
    url?: string;
    reference_text?: string;
    narrator?: string | null;
    arabic_text?: string | null;
    translation_en?: string | null;
    grade?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing 'url'" }, { status: 400 });
  }

  const canonical = canonicalizeSunnahUrl(rawUrl);
  if (!canonical) {
    return NextResponse.json(
      { error: "URL must be on sunnah.com" },
      { status: 400 }
    );
  }

  const parsed = referenceFromUrl(canonical);
  const reference =
    body.reference_text?.trim() || parsed?.reference || canonical;

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("hadith_verifications")
    .insert({
      reference_text: reference,
      sunnah_com_url: canonical,
      narrator: body.narrator || null,
      arabic_text: body.arabic_text || null,
      translation_en: body.translation_en || null,
      grade: body.grade || null,
      verified: true,
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ hadith: data }, { status: 201 });
}
