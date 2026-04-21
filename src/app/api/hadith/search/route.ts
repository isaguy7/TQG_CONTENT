import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hadith/search
 *
 * Query params:
 *   q          required, >= 3 chars (trimmed). Returns 400 below that.
 *   collection optional, one of: bukhari | muslim | abudawud | ibnmajah | nasai
 *   limit      default 20, clamped 1-100
 *   offset     default 0, >= 0
 *
 * Strategy:
 *   1. If q parses as "<collection> <number>" (e.g. "bukhari 6018"),
 *      short-circuit to a direct btree lookup on
 *      (collection, hadith_number). ~1 ms.
 *   2. Otherwise fuzzy-search across english_text / arabic_text /
 *      narrator via ILIKE %q%. Trigram GIN indexes from
 *      20260421110000_v10_hadith_search_indexes.sql make this
 *      4-120 ms depending on selectivity.
 *
 * Auth: any authenticated user. Corpus is shared reference data
 * (already enforced by hadith_corpus.authenticated_read RLS from
 * the §1 RLS remediation), so no org scoping on the search surface.
 *
 * Legacy /api/hadith/search (sunnah.com live scraping via
 * searchSunnah()) was moved to /api/hadith/sunnah-search so this
 * route could own the §7 picker path. Dual-surface noted in
 * REFACTOR_DEBT.md.
 */

const COLLECTIONS = new Set([
  "bukhari",
  "muslim",
  "abudawud",
  "ibnmajah",
  "nasai",
]);

const SHORTCUT_RE = /^(bukhari|muslim|abudawud|ibnmajah|nasai)\s+(\d+)$/i;

const SELECT_COLS =
  "id,collection,collection_name,hadith_number,chapter_number,chapter_title_en,arabic_text,english_text,narrator,grade,sunnah_com_url,in_book_reference";

/** Escape ILIKE wildcards (% and _) and neutralise commas/parens
 *  that are structural in PostgREST's .or() filter string. Lossy
 *  but safe; search queries realistically don't contain those chars. */
function buildIlikePattern(raw: string): string {
  const safe = raw.replace(/[%_]/g, (m) => `\\${m}`).replace(/[,()]/g, " ");
  return `%${safe}%`;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const qRaw = (sp.get("q") ?? "").trim();
  const collection = (sp.get("collection") ?? "").trim().toLowerCase();

  if (qRaw.length < 3) {
    return NextResponse.json(
      { error: "QUERY_TOO_SHORT", message: "Query must be at least 3 characters" },
      { status: 400 }
    );
  }

  if (collection && !COLLECTIONS.has(collection)) {
    return NextResponse.json(
      { error: "INVALID_COLLECTION", message: "Unknown collection" },
      { status: 400 }
    );
  }

  const limitRaw = Number(sp.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, Math.trunc(limitRaw)))
    : 20;
  const offsetRaw = Number(sp.get("offset") ?? "0");
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.trunc(offsetRaw))
    : 0;

  const db = createClient();

  // Shortcut path: "bukhari 6018" style exact lookup. Uses the
  // (collection, hadith_number) composite btree index.
  const shortcut = qRaw.match(SHORTCUT_RE);
  if (shortcut) {
    const col = shortcut[1].toLowerCase();
    const num = parseInt(shortcut[2], 10);
    if (collection && collection !== col) {
      return NextResponse.json({
        results: [],
        total: 0,
        limit,
        offset,
        query: qRaw,
      });
    }
    const { data, error } = await db
      .from("hadith_corpus")
      .select(SELECT_COLS)
      .eq("collection", col)
      .eq("hadith_number", num)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const results = data ? [data] : [];
    return NextResponse.json({
      results,
      total: results.length,
      limit,
      offset,
      query: qRaw,
    });
  }

  // Fuzzy path: ILIKE across english_text / arabic_text / narrator.
  const pattern = buildIlikePattern(qRaw);
  const orFilter = [
    `english_text.ilike.${pattern}`,
    `arabic_text.ilike.${pattern}`,
    `narrator.ilike.${pattern}`,
  ].join(",");

  let qb = db
    .from("hadith_corpus")
    .select(SELECT_COLS, { count: "exact" })
    .or(orFilter)
    .order("collection", { ascending: true })
    .order("hadith_number", { ascending: true })
    .range(offset, offset + limit - 1);

  if (collection) qb = qb.eq("collection", collection);

  const { data, count, error } = await qb;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    results: data ?? [],
    total: count ?? 0,
    limit,
    offset,
    query: qRaw,
  });
}
