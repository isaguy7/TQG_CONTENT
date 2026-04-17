/**
 * Phase 4: Fuzzy Quran matcher.
 *
 * Given a transcribed Arabic text segment, returns ranked candidate ayahs
 * that look like what was recited. Isa (hafiz) verifies every match
 * manually — this is a suggestion engine, not a source of truth.
 *
 * Approach:
 *   1. Normalize both input and corpus (strip harakat / unify hamza / alef).
 *   2. Build a word-trigram index over the 6,236 normalized ayahs at first
 *      call (cached in-process; ~few hundred KB).
 *   3. For each sliding 3-5 word window in the input, score candidate
 *      ayahs by shared-trigram count, then refine the top N with a
 *      normalized Levenshtein distance on the actual strings.
 */

import { getSupabaseServer } from "@/lib/supabase";

export type QuranAyah = {
  id: string;
  surah: number;
  ayah: number;
  verse_key: string;
  text_uthmani: string;
  normalized: string;
  translation_en: string | null;
};

export type MatchResult = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
  score: number; // 0..1 — higher is better
  matched_window: string;
};

let corpusCache: QuranAyah[] | null = null;
let trigramIndex: Map<string, number[]> | null = null;
let loadingPromise: Promise<void> | null = null;

export function normalizeArabic(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  s = s.replace(/\u0640/g, "");
  s = s.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673]/g, "\u0627");
  s = s.replace(/[\u0649\u06CC]/g, "\u064A");
  s = s.replace(/\u0629/g, "\u0647");
  s = s.replace(/\u0624/g, "\u0648");
  s = s.replace(/\u0626/g, "\u064A");
  s = s.replace(/\u0621/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function wordTrigrams(normalized: string): string[] {
  const words = normalized.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  if (words.length < 3) {
    if (words.length > 0) out.push(words.join(" "));
    return out;
  }
  for (let i = 0; i + 3 <= words.length; i++) {
    out.push(words.slice(i, i + 3).join(" "));
  }
  return out;
}

async function loadCorpus(): Promise<void> {
  if (corpusCache && trigramIndex) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const db = getSupabaseServer();
    const { data, error } = await db
      .from("quran_cache")
      .select("id,surah,ayah,verse_key,text_uthmani,normalized,translation_en")
      .order("surah", { ascending: true })
      .order("ayah", { ascending: true });
    if (error) throw new Error(`Quran corpus load failed: ${error.message}`);
    const rows = (data || []) as QuranAyah[];
    const idx = new Map<string, number[]>();
    rows.forEach((row, i) => {
      for (const tri of wordTrigrams(row.normalized)) {
        const existing = idx.get(tri);
        if (existing) existing.push(i);
        else idx.set(tri, [i]);
      }
    });
    corpusCache = rows;
    trigramIndex = idx;
  })();
  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

/** Levenshtein ratio clamped to [0, 1]. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) / Math.max(m, n) > 0.8) return 0;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  const dist = dp[n];
  return 1 - dist / Math.max(m, n);
}

export async function matchTranscriptToAyahs(
  transcript: string,
  threshold: number = 0.35
): Promise<MatchResult[]> {
  if (!transcript?.trim()) return [];
  await loadCorpus();
  const corpus = corpusCache!;
  const index = trigramIndex!;

  const normalized = normalizeArabic(transcript);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Sliding windows of 3, 4, and 5 words.
  const windows: string[] = [];
  for (const size of [5, 4, 3]) {
    if (words.length < size) continue;
    for (let i = 0; i + size <= words.length; i++) {
      windows.push(words.slice(i, i + size).join(" "));
    }
  }
  if (windows.length === 0) windows.push(normalized);

  // Count hits per ayah index.
  const hits = new Map<number, { count: number; window: string }>();
  for (const w of windows) {
    const tris = wordTrigrams(w);
    for (const tri of tris) {
      const matches = index.get(tri);
      if (!matches) continue;
      for (const i of matches) {
        const cur = hits.get(i);
        if (!cur) hits.set(i, { count: 1, window: w });
        else {
          cur.count += 1;
          if (w.length > cur.window.length) cur.window = w;
        }
      }
    }
  }

  const candidates = Array.from(hits.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40);

  const scored: MatchResult[] = [];
  for (const [idx, info] of candidates) {
    const ayah = corpus[idx];
    const sim = similarity(info.window, ayah.normalized);
    const triBoost = Math.min(1, info.count / 6);
    const score = sim * 0.75 + triBoost * 0.25;
    if (score < threshold) continue;
    scored.push({
      verse_key: ayah.verse_key,
      surah: ayah.surah,
      ayah: ayah.ayah,
      text_uthmani: ayah.text_uthmani,
      translation_en: ayah.translation_en,
      score,
      matched_window: info.window,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

export async function getAyah(
  surah: number,
  ayah: number
): Promise<QuranAyah | null> {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("quran_cache")
    .select("id,surah,ayah,verse_key,text_uthmani,normalized,translation_en")
    .eq("surah", surah)
    .eq("ayah", ayah)
    .maybeSingle();
  if (error) return null;
  return (data as QuranAyah) || null;
}

export async function searchEnglishTranslation(
  query: string,
  limit: number = 20
): Promise<QuranAyah[]> {
  const db = getSupabaseServer();
  const escaped = query.replace(/[%_]/g, (m) => `\\${m}`);
  const { data, error } = await db
    .from("quran_cache")
    .select("id,surah,ayah,verse_key,text_uthmani,normalized,translation_en")
    .ilike("translation_en", `%${escaped}%`)
    .order("surah", { ascending: true })
    .order("ayah", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data || []) as QuranAyah[];
}
