import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hadith-corpus/search?q=intentions&collection=bukhari&limit=20
 *
 * - If q is provided, runs PostgreSQL websearch full-text on english_text.
 *   Falls back to trigram/ilike when the full-text query returns 0 rows.
 * - Collection filter maps to the collection slug column.
 * - limit clamped to [0, 50]. limit=0 returns only the count (no rows).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const collection = sp.get("collection")?.trim() || "";
  const limitRaw = Number(sp.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(0, Math.min(50, Math.trunc(limitRaw)))
    : 20;

  const db = getSupabaseServer();

  const base = (headOnly = false) => {
    let qb = db
      .from("hadith_corpus")
      .select("*", { count: "exact", head: headOnly })
      .order("collection", { ascending: true })
      .order("hadith_number", { ascending: true });
    if (collection) qb = qb.eq("collection", collection);
    return qb;
  };

  if (!q) {
    if (limit === 0) {
      const { count, error } = await base(true);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ results: [], total: count ?? 0 });
    }
    const { data, count, error } = await base().limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      results: data || [],
      total: count ?? 0,
    });
  }

  if (limit === 0) {
    const { count, error } = await base(true).textSearch("english_text", q, {
      type: "websearch",
      config: "english",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ results: [], total: count ?? 0 });
  }

  const safeLimit = limit;

  const ftsRes = await base()
    .textSearch("english_text", q, { type: "websearch", config: "english" })
    .limit(safeLimit);
  if (ftsRes.error) {
    return NextResponse.json({ error: ftsRes.error.message }, { status: 500 });
  }
  if ((ftsRes.data?.length ?? 0) > 0) {
    return NextResponse.json({
      results: ftsRes.data || [],
      total: ftsRes.count ?? ftsRes.data?.length ?? 0,
    });
  }

  // Fallback: substring match for phrases / partial words that websearch missed.
  const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
  const fbRes = await base()
    .ilike("english_text", `%${escaped}%`)
    .limit(safeLimit);
  if (fbRes.error) {
    return NextResponse.json({ error: fbRes.error.message }, { status: 500 });
  }
  return NextResponse.json({
    results: fbRes.data || [],
    total: fbRes.count ?? fbRes.data?.length ?? 0,
  });
}
