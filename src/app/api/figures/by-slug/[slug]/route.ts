import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import type { HookAngle, IslamicFigure } from "@/types/figure";

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

type Params = { params: { slug: string } };

/**
 * GET /api/figures/[slug]
 *
 * Returns the figure plus linked hadith / Quran refs + recent posts.
 * Auth: any authenticated user (islamic_figures is shared reference
 * data across orgs per V10_Product_Context.md). Admin client for the
 * fetches — bypasses RLS, matches the pattern elsewhere in /api/figures.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  if (!SLUG_PATTERN.test(params.slug)) {
    return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
  }

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const db = createClient();

  const { data: figure, error: figureErr } = await db
    .from("islamic_figures")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  if (figureErr) {
    return NextResponse.json({ error: figureErr.message }, { status: 500 });
  }
  if (!figure) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Parallel fetches for linked content. figure_hadith_refs uses
  // `hadith_corpus_id` (not `hadith_id`) as the FK column per the
  // junction table schema; figure_quran_refs stores verse_key directly
  // + joins to quran_cache by verse_key for display content.
  const [
    { data: hadithRefs },
    { data: quranRefs },
    { data: posts },
    { count: postCountResult },
  ] = await Promise.all([
    db
      .from("figure_hadith_refs")
      .select("relevance_note, hadith_corpus:hadith_corpus_id(*)")
      .eq("figure_id", figure.id),
    db
      .from("figure_quran_refs")
      .select("verse_key, surah, ayah, relevance_note, tafseer_note")
      .eq("figure_id", figure.id)
      .order("surah", { ascending: true })
      .order("ayah", { ascending: true }),
    db
      .from("posts")
      .select("id, title, status, platforms, platform, updated_at, final_content")
      .eq("figure_id", figure.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("figure_id", figure.id)
      .is("deleted_at", null),
  ]);

  // quran_cache join via verse_key isn't a formal FK relationship in
  // the schema, so fetch verses separately by verse_key IN list.
  let quranVerses: Record<
    string,
    { text_uthmani: string; translation_en: string | null }
  > = {};
  const keys = (quranRefs ?? [])
    .map((r) => r.verse_key as string)
    .filter(Boolean);
  if (keys.length > 0) {
    const { data: verses } = await db
      .from("quran_cache")
      .select("verse_key, text_uthmani, translation_en")
      .in("verse_key", keys);
    quranVerses = Object.fromEntries(
      (verses ?? []).map((v) => [
        v.verse_key,
        {
          text_uthmani: v.text_uthmani as string,
          translation_en: v.translation_en as string | null,
        },
      ])
    );
  }

  const quranRefsWithText = (quranRefs ?? []).map((r) => ({
    ...r,
    verse: quranVerses[r.verse_key as string] ?? null,
  }));

  return NextResponse.json({
    figure,
    hadith_refs: hadithRefs ?? [],
    quran_refs: quranRefsWithText,
    recent_posts: posts ?? [],
    post_count: postCountResult ?? 0,
  });
}

/**
 * PATCH /api/figures/[slug]
 *
 * Updates mutable fields. slug is immutable post-creation. For M1
 * (single-tenant) any authenticated user can edit; in M3 multi-org
 * this should gate on an admin role — TODO when that lands.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!SLUG_PATTERN.test(params.slug)) {
    return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
  }

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    name_en?: string;
    name_ar?: string | null;
    title?: string | null;
    type?: string;
    era?: string | null;
    bio_short?: string;
    themes?: string[];
    hook_angles?: HookAngle[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.name_en !== undefined) {
    if (body.name_en.length < 1 || body.name_en.length > 100) {
      return NextResponse.json(
        { error: "name_en must be 1-100 characters" },
        { status: 400 }
      );
    }
    update.name_en = body.name_en;
  }

  if (body.name_ar !== undefined) {
    if (body.name_ar !== null && body.name_ar.length > 100) {
      return NextResponse.json(
        { error: "name_ar must be 0-100 characters" },
        { status: 400 }
      );
    }
    update.name_ar = body.name_ar;
  }

  if (body.title !== undefined) update.title = body.title;
  if (body.era !== undefined) update.era = body.era;
  if (body.bio_short !== undefined) update.bio_short = body.bio_short;

  if (body.type !== undefined) {
    if (!FIGURE_TYPES.has(body.type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    update.type = body.type;
  }

  if (body.themes !== undefined) {
    if (!Array.isArray(body.themes) || body.themes.length > 20) {
      return NextResponse.json(
        { error: "themes must be an array of at most 20" },
        { status: 400 }
      );
    }
    for (const t of body.themes) {
      if (typeof t !== "string" || t.length < 1 || t.length > 50) {
        return NextResponse.json(
          { error: "each theme must be a string 1-50 characters" },
          { status: 400 }
        );
      }
    }
    update.themes = body.themes;
  }

  if (body.hook_angles !== undefined) {
    if (!Array.isArray(body.hook_angles) || body.hook_angles.length > 10) {
      return NextResponse.json(
        { error: "hook_angles must be an array of at most 10" },
        { status: 400 }
      );
    }
    for (const a of body.hook_angles) {
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
    update.hook_angles = body.hook_angles;
  }

  const db = createClient();
  const { data, error } = await db
    .from("islamic_figures")
    .update(update)
    .eq("slug", params.slug)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ figure: data as IslamicFigure });
}

/**
 * DELETE /api/figures/[slug]
 *
 * Soft-delete — but islamic_figures has no deleted_at column yet.
 * Commit 5 of §6 adds the column via migration; until then we stub
 * to 501 so the UI can wire the ConfirmDialog flow without actually
 * losing data.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!SLUG_PATTERN.test(params.slug)) {
    return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
  }

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  return NextResponse.json(
    {
      error: "NOT_IMPLEMENTED",
      message:
        "Soft delete requires islamic_figures.deleted_at — landing in §6 commit 5 migration.",
    },
    { status: 501 }
  );
}
