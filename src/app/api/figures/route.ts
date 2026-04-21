import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import type { HookAngle } from "@/types/figure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FIGURE_TYPES = new Set(["sahabi", "prophet", "scholar", "tabii"]);
const HOOK_CATEGORIES = new Set([
  "contrast",
  "provocative",
  "scene",
  "purpose",
  "refusal",
  "dua",
  "scale",
  "loss",
  "character",
]);

/** Mirrors the migration's slug derivation: lowercase, collapse
 *  runs of non-alphanumeric chars to single hyphens, trim edges. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  const db = createClient();
  const { data: figures, error } = await db
    .from("islamic_figures")
    .select(
      "id,slug,name_en,name_ar,title,type,era,bio_short,themes,hook_angles,quran_refs,posts_written,last_posted_at,created_at,updated_at"
    )
    .is("deleted_at", null)
    .order("name_en", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const figuresList = figures || [];
  const ids = figuresList.map((f) => f.id);

  const counts: Record<
    string,
    { hadith: number; quran: number; post: number }
  > = {};
  for (const id of ids) counts[id] = { hadith: 0, quran: 0, post: 0 };

  if (ids.length > 0) {
    // Default PostgREST row cap is 1000, so raise it explicitly — a single
    // figure can easily have hundreds of linked hadith. Matching ref-count
    // pattern for post_count: fetch figure_id lists + aggregate in JS.
    // Correlated-subquery via PostgREST FK syntax is noisier to filter
    // by deleted_at; 15-70 figures × ~N posts each is trivial either way.
    const [
      { data: hadithRows },
      { data: quranRows },
      { data: postRows },
    ] = await Promise.all([
      db
        .from("figure_hadith_refs")
        .select("figure_id")
        .in("figure_id", ids)
        .limit(100000),
      db
        .from("figure_quran_refs")
        .select("figure_id")
        .in("figure_id", ids)
        .limit(100000),
      db
        .from("posts")
        .select("figure_id")
        .in("figure_id", ids)
        .is("deleted_at", null)
        .limit(100000),
    ]);
    for (const r of hadithRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.hadith += 1;
    }
    for (const r of quranRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.quran += 1;
    }
    for (const r of postRows || []) {
      const bucket = counts[r.figure_id as string];
      if (bucket) bucket.post += 1;
    }
  }

  return NextResponse.json({
    figures: figuresList.map((f) => ({
      ...f,
      hadith_ref_count: counts[f.id]?.hadith ?? 0,
      quran_ref_count: counts[f.id]?.quran ?? 0,
      post_count: counts[f.id]?.post ?? 0,
    })),
  });
}

/**
 * POST /api/figures
 *
 * Creates a new islamic_figures row. Slug may be provided; if absent,
 * derived from name_en via the same logic the migration uses. Slug
 * uniqueness check includes soft-deleted rows — a deleted slug stays
 * taken so a potential undelete can't collide.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    name_en?: string;
    name_ar?: string | null;
    title?: string | null;
    type?: string;
    era?: string | null;
    bio_short?: string;
    slug?: string;
    themes?: string[];
    hook_angles?: HookAngle[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required fields
  if (!body.name_en || body.name_en.length < 1 || body.name_en.length > 100) {
    return NextResponse.json(
      { error: "name_en is required and must be 1-100 characters" },
      { status: 400 }
    );
  }
  if (!body.type || !FIGURE_TYPES.has(body.type)) {
    return NextResponse.json(
      { error: "type is required and must be one of: sahabi, prophet, scholar, tabii" },
      { status: 400 }
    );
  }
  if (!body.bio_short || body.bio_short.length < 1) {
    return NextResponse.json(
      { error: "bio_short is required" },
      { status: 400 }
    );
  }

  // Optional-with-shape
  if (
    body.name_ar !== undefined &&
    body.name_ar !== null &&
    body.name_ar.length > 100
  ) {
    return NextResponse.json(
      { error: "name_ar must be 0-100 characters" },
      { status: 400 }
    );
  }
  if (
    body.title !== undefined &&
    body.title !== null &&
    body.title.length > 200
  ) {
    return NextResponse.json(
      { error: "title must be 0-200 characters" },
      { status: 400 }
    );
  }

  // Arrays with per-item validation
  const themes = body.themes ?? [];
  if (!Array.isArray(themes) || themes.length > 20) {
    return NextResponse.json(
      { error: "themes must be an array of at most 20" },
      { status: 400 }
    );
  }
  for (const t of themes) {
    if (typeof t !== "string" || t.length < 1 || t.length > 50) {
      return NextResponse.json(
        { error: "each theme must be a string 1-50 characters" },
        { status: 400 }
      );
    }
  }

  const hookAngles = body.hook_angles ?? [];
  if (!Array.isArray(hookAngles) || hookAngles.length > 10) {
    return NextResponse.json(
      { error: "hook_angles must be an array of at most 10" },
      { status: 400 }
    );
  }
  for (const a of hookAngles) {
    if (
      !a ||
      typeof a !== "object" ||
      typeof a.category !== "string" ||
      !HOOK_CATEGORIES.has(a.category) ||
      typeof a.template !== "string" ||
      a.template.length < 1 ||
      a.template.length > 500
    ) {
      return NextResponse.json(
        { error: "invalid hook angle entry" },
        { status: 400 }
      );
    }
  }

  // Slug — user-supplied or derived from name_en
  const slug = (body.slug ?? slugify(body.name_en)).trim();
  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: "INVALID_SLUG", message: "Slug format invalid" },
      { status: 400 }
    );
  }

  const db = createClient();

  // Uniqueness check. Include soft-deleted rows — if a deleted slug
  // could be re-taken, an undelete would collide.
  const { data: existing, error: lookupErr } = await db
    .from("islamic_figures")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      { error: "SLUG_TAKEN", message: "That slug is already used." },
      { status: 409 }
    );
  }

  const { data, error } = await db
    .from("islamic_figures")
    .insert({
      name_en: body.name_en,
      name_ar: body.name_ar ?? null,
      title: body.title ?? null,
      type: body.type,
      era: body.era ?? null,
      bio_short: body.bio_short,
      slug,
      themes,
      hook_angles: hookAngles,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ figure: data }, { status: 201 });
}
