import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { canonicalizeSunnahUrl, referenceFromUrl } from "@/lib/sunnah-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hadith — list all hadith verifications, newest first.
 * Optional ?verified=true|false to filter.
 */
export async function GET(req: NextRequest) {
  const db = createClient();
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
 * POST /api/hadith — create a new hadith verification from a sunnah.com URL.
 * Starts as verified=false. Use PATCH /api/hadith/[id] to mark verified
 * after manual review.
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
  const trimmedRef = body.reference_text?.trim();

  // Allow corpus entries with a reference but no URL; otherwise require a URL.
  if (!rawUrl && !trimmedRef) {
    return NextResponse.json(
      { error: "Must provide 'url' or 'reference_text'" },
      { status: 400 }
    );
  }

  let canonical: string | null = null;
  if (rawUrl) {
    canonical = canonicalizeSunnahUrl(rawUrl);
    if (!canonical) {
      return NextResponse.json(
        { error: "URL must be on sunnah.com" },
        { status: 400 }
      );
    }
  }

  const parsed = canonical ? referenceFromUrl(canonical) : null;
  const reference = trimmedRef || parsed?.reference || canonical;
  if (!reference) {
    return NextResponse.json(
      { error: "Could not determine 'reference_text'" },
      { status: 400 }
    );
  }

  const db = createClient();
  const { data, error } = await db
    .from("hadith_verifications")
    .insert({
      reference_text: reference,
      sunnah_com_url: canonical,
      narrator: body.narrator || null,
      arabic_text: body.arabic_text || null,
      translation_en: body.translation_en || null,
      grade: body.grade || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ hadith: data }, { status: 201 });
}
