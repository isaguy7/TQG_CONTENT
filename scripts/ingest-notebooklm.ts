#!/usr/bin/env node
/**
 * V10 §8 commit 0 — NotebookLM scholarly ingest.
 *
 * One-time (re-runnable) load of the spreadsheet at
 * data/notebooklm/Islamic_Jurisprudence_and_Qur_anic_Commentary_Data_Table.xlsx
 * into the three reference tables created by
 * supabase/migrations/20260422100000_v10_notebooklm_ingest.sql:
 *
 *   - source_references (28 rows from sheet 2)
 *   - ayah_scholarly_refs (62 rows from sheet 1)
 *   - ayah_scholarly_authorities (~150-200 rows after fuzzy-matching
 *     each comma-separated "Primary Authority Mentioned" against
 *     islamic_figures.name_en)
 *
 * Idempotent — UPSERTs the refs (UNIQUE constraint on
 * verse_key + legal_subject) and DELETEs-then-INSERTs the authorities
 * for each ref so re-runs pick up new figures or updated normalisation.
 *
 * Run:
 *   npm install                                # picks up xlsx + dotenv
 *   npx tsx scripts/ingest-notebooklm.ts
 *
 * Env required (read from .env.local automatically via dotenv):
 *   SUPABASE_URL              or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Outputs to data/notebooklm/output/ (gitignored):
 *   exact_matches.json        — { authority, figure_slug }[]
 *   fuzzy_matches.json        — { authority, figure_slug, similarity }[],
 *                               sorted asc (worst first) so Isa can
 *                               eyeball low-confidence matches
 *   unmatched_authorities.json — { authority, occurrences }[],
 *                               sorted by occurrences desc
 */

import * as path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXCEL_PATH =
  "data/notebooklm/Islamic_Jurisprudence_and_Qur_anic_Commentary_Data_Table.xlsx";
const OUTPUT_DIR = "data/notebooklm/output";
const FUZZY_SIMILARITY_THRESHOLD = 0.55;
const MAX_LEVENSHTEIN_DISTANCE = 5;

/**
 * Honorifics + scholar/sahabi titles to strip during normalisation.
 * Kept LOWERCASE and as full words (\b boundary). The kunya particles
 * (ibn / bin / abu / al) are stripped too — verified against the figure
 * library: "Umar ibn al-Khattab" and "Umar bin Al-Khattab" both
 * normalise to "umar khattab", matching the spreadsheet's spelling
 * variants.
 */
const HONORIFIC_RE =
  /\b(ra|as|saw|swt|ibn|bin|ibnu|abu|abũ|al|as|sayyidna|hadrat|imam|sheikh|mufti|hafiz|allamah)\b/gi;

/**
 * Hard blocklist: entries here are FORCED to unmatched even if the
 * fuzzy matcher disagrees. Spreadsheet → figure pairs we know are
 * false positives.
 */
const BLOCKED_PAIRS: Array<[string, string]> = [
  ["malik", "ali ibn abi talib"],
  ["as-sa'di", "sa'd ibn abi waqqas"],
  ["sa'di", "sa'd ibn abi waqqas"],
  ["asadi", "sa'd ibn abi waqqas"],
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawRow {
  "Surah and Verse Reference": string;
  "Legal Subject Matter": string;
  "Ruling or Commentary Strategy": string | null;
  "Primary Authority Mentioned": string | null;
  "Circumstances of Revelation (Asbab al-Nuzul)": string | null;
  "Prophetic Hadith or Tradition Cited": string | null;
  "Linguistic or Rhetorical Feature": string | null;
  Source: string | number | null;
}

interface SourceRow {
  Index: string | number;
  Reference: string;
}

interface ParsedRef {
  verseKey: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  legalSubject: string;
  rulingStrategy: string | null;
  asbabAlNuzul: string | null;
  hadithCited: string | null;
  linguisticFeature: string | null;
  sourceIndices: number[];
  authorities: string[];
}

interface FigureRow {
  id: string;
  name_en: string;
  slug: string;
}

interface MatchResult {
  authority: string;
  normalized: string;
  figure_id: string | null;
  figure_slug: string | null;
  match_confidence: "exact" | "fuzzy" | "unmatched";
  similarity?: number;
}

// ---------------------------------------------------------------------------
// Normalisation + matching
// ---------------------------------------------------------------------------

/** Lowercase, strip combining diacritics, drop honorifics, collapse
 *  punctuation/spacing. Keep word order — kunya order matters less
 *  than substring overlap for trigram similarity. */
function normalise(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(HONORIFIC_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Levenshtein. Used as a guard rail — fuzzy similarity above
 *  threshold can still be wrong if the strings are very different
 *  lengths (e.g. "malik" vs "ali ibn abi talib" trigram-overlap on
 *  the "ali" substring). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function isBlocked(authorityNorm: string, figureNameNorm: string): boolean {
  for (const [a, f] of BLOCKED_PAIRS) {
    if (
      authorityNorm.includes(normalise(a)) &&
      figureNameNorm.includes(normalise(f))
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Verse-key parsing
// ---------------------------------------------------------------------------

/** "2:142" → { surah: 2, ayahStart: 142, ayahEnd: 142, verseKey: "2:142" }
 *  "2:178-179" → { surah: 2, ayahStart: 178, ayahEnd: 179, verseKey: "2:178-179" } */
function parseVerseKey(raw: string): {
  verseKey: string;
  surah: number;
  ayahStart: number;
  ayahEnd: number;
} {
  const cleaned = raw.trim().replace(/\s+/g, "");
  const rangeMatch = cleaned.match(/^(\d+):(\d+)-(\d+)$/);
  if (rangeMatch) {
    const surah = parseInt(rangeMatch[1], 10);
    const ayahStart = parseInt(rangeMatch[2], 10);
    const ayahEnd = parseInt(rangeMatch[3], 10);
    return { verseKey: cleaned, surah, ayahStart, ayahEnd };
  }
  const singleMatch = cleaned.match(/^(\d+):(\d+)$/);
  if (singleMatch) {
    const surah = parseInt(singleMatch[1], 10);
    const ayah = parseInt(singleMatch[2], 10);
    return { verseKey: cleaned, surah, ayahStart: ayah, ayahEnd: ayah };
  }
  throw new Error(`Unparseable verse reference: ${JSON.stringify(raw)}`);
}

function parseSourceIndices(raw: string | number | null): number[] {
  if (raw == null) return [];
  return String(raw)
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

function parseAuthorities(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  dotenv.config({ path: ".env.local" });
  dotenv.config();

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "[ingest] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set in .env.local"
    );
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  if (!existsSync(EXCEL_PATH)) {
    console.error(`[ingest] Excel not found at ${EXCEL_PATH}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(EXCEL_PATH);

  // ---- Sheet 2: Source References --------------------------------------
  const sourcesSheet = wb.Sheets["Source References"];
  const sourceRows = XLSX.utils.sheet_to_json<SourceRow>(sourcesSheet, {
    defval: null,
  });
  const sourcePayload = sourceRows.map((row) => ({
    reference_index: parseInt(String(row.Index), 10),
    display_name: String(row.Reference).replace(/\.pdf$/i, ""),
    filename: String(row.Reference),
    source_type: classifySource(String(row.Reference)),
  }));
  const { error: srcErr } = await db
    .from("source_references")
    .upsert(sourcePayload, {
      onConflict: "reference_index",
      ignoreDuplicates: true,
    });
  if (srcErr) throw new Error(`source_references upsert: ${srcErr.message}`);
  console.log(`[ingest] source_references upserted: ${sourcePayload.length}`);

  // ---- Sheet 1: scholarly refs -----------------------------------------
  const refsSheet = wb.Sheets["Table 1"];
  const rawRefs = XLSX.utils.sheet_to_json<RawRow>(refsSheet, {
    defval: null,
  });
  const parsedRefs: ParsedRef[] = rawRefs.map((row) => {
    const { verseKey, surah, ayahStart, ayahEnd } = parseVerseKey(
      row["Surah and Verse Reference"]
    );
    return {
      verseKey,
      surah,
      ayahStart,
      ayahEnd,
      legalSubject: row["Legal Subject Matter"],
      rulingStrategy: row["Ruling or Commentary Strategy"],
      asbabAlNuzul: row["Circumstances of Revelation (Asbab al-Nuzul)"],
      hadithCited: row["Prophetic Hadith or Tradition Cited"],
      linguisticFeature: row["Linguistic or Rhetorical Feature"],
      sourceIndices: parseSourceIndices(row.Source),
      authorities: parseAuthorities(row["Primary Authority Mentioned"]),
    };
  });

  // Upsert refs and capture id for each (verse_key, legal_subject) pair.
  const refsPayload = parsedRefs.map((r) => ({
    verse_key: r.verseKey,
    surah: r.surah,
    ayah_start: r.ayahStart,
    ayah_end: r.ayahEnd,
    legal_subject: r.legalSubject,
    ruling_strategy: r.rulingStrategy,
    asbab_al_nuzul: r.asbabAlNuzul,
    hadith_cited: r.hadithCited,
    linguistic_feature: r.linguisticFeature,
    source_indices: r.sourceIndices,
  }));
  const { data: insertedRefs, error: refsErr } = await db
    .from("ayah_scholarly_refs")
    .upsert(refsPayload, {
      onConflict: "verse_key,legal_subject",
      ignoreDuplicates: false,
    })
    .select("id, verse_key, legal_subject");
  if (refsErr) throw new Error(`ayah_scholarly_refs upsert: ${refsErr.message}`);
  if (!insertedRefs) throw new Error("ayah_scholarly_refs: no rows returned");
  console.log(
    `[ingest] ayah_scholarly_refs upserted: ${insertedRefs.length}`
  );

  // Build (verse_key, legal_subject) → id map.
  const refIdMap = new Map<string, string>();
  for (const r of insertedRefs) {
    refIdMap.set(`${r.verse_key}|||${r.legal_subject}`, r.id);
  }

  // ---- Authorities -----------------------------------------------------
  const { data: figures, error: figErr } = await db
    .from("islamic_figures")
    .select("id, name_en, slug")
    .is("deleted_at", null);
  if (figErr) throw new Error(`islamic_figures fetch: ${figErr.message}`);
  if (!figures) throw new Error("islamic_figures: no rows returned");
  const figureMap = (figures as FigureRow[]).map((f) => ({
    ...f,
    normalized: normalise(f.name_en),
  }));

  const exactMatches: Array<{ authority: string; figure_slug: string }> = [];
  const fuzzyMatches: Array<{
    authority: string;
    figure_slug: string;
    similarity: number;
    levenshtein: number;
  }> = [];
  const unmatchedCount = new Map<string, number>();

  // For each ref, resolve its authorities via DB-side similarity().
  // Group authorities by ref so we DELETE+INSERT atomically.
  for (const r of parsedRefs) {
    const refId = refIdMap.get(`${r.verseKey}|||${r.legalSubject}`);
    if (!refId) {
      console.warn(
        `[ingest] no ref id for ${r.verseKey} / ${r.legalSubject} — skipping`
      );
      continue;
    }

    const matches: MatchResult[] = [];
    for (const authority of r.authorities) {
      const norm = normalise(authority);
      if (norm.length === 0) continue;

      // 1. Exact match (after normalisation)
      const exact = figureMap.find((f) => f.normalized === norm);
      if (exact) {
        matches.push({
          authority,
          normalized: norm,
          figure_id: exact.id,
          figure_slug: exact.slug,
          match_confidence: "exact",
        });
        exactMatches.push({ authority, figure_slug: exact.slug });
        continue;
      }

      // 2. Fuzzy match via pg_trgm. Single round-trip per authority.
      const { data: simRow, error: simErr } = await db.rpc("similarity_match", {
        p_query: norm,
      });
      let figureId: string | null = null;
      let figureSlug: string | null = null;
      let sim = 0;
      let lev = Number.MAX_SAFE_INTEGER;
      if (simErr) {
        // Fall back to a direct query if the RPC isn't installed.
        const { data: rows } = await db
          .from("islamic_figures")
          .select("id, name_en, slug")
          .is("deleted_at", null);
        if (rows) {
          for (const f of rows as FigureRow[]) {
            const figNorm = normalise(f.name_en);
            const l = levenshtein(norm, figNorm);
            if (l < lev) {
              lev = l;
              figureId = f.id;
              figureSlug = f.slug;
            }
          }
          // Approximate similarity via 1 - lev / max(len)
          sim =
            lev === Number.MAX_SAFE_INTEGER
              ? 0
              : 1 - lev / Math.max(norm.length, 1);
        }
      } else if (simRow && Array.isArray(simRow) && simRow.length > 0) {
        figureId = simRow[0].id;
        figureSlug = simRow[0].slug;
        sim = simRow[0].sim;
        const figNorm = normalise(simRow[0].name_en);
        lev = levenshtein(norm, figNorm);
      }

      const blocked =
        figureId &&
        figureSlug &&
        isBlocked(
          norm,
          figureMap.find((f) => f.id === figureId)?.normalized ?? ""
        );

      if (
        figureId &&
        figureSlug &&
        sim >= FUZZY_SIMILARITY_THRESHOLD &&
        lev <= MAX_LEVENSHTEIN_DISTANCE &&
        !blocked
      ) {
        matches.push({
          authority,
          normalized: norm,
          figure_id: figureId,
          figure_slug: figureSlug,
          match_confidence: "fuzzy",
          similarity: sim,
        });
        fuzzyMatches.push({
          authority,
          figure_slug: figureSlug,
          similarity: sim,
          levenshtein: lev,
        });
      } else {
        matches.push({
          authority,
          normalized: norm,
          figure_id: null,
          figure_slug: null,
          match_confidence: "unmatched",
        });
        unmatchedCount.set(
          authority,
          (unmatchedCount.get(authority) ?? 0) + 1
        );
      }
    }

    // DELETE-then-INSERT so re-runs replace the authority list (figure
    // library may grow / blocklist may change between runs).
    const { error: delErr } = await db
      .from("ayah_scholarly_authorities")
      .delete()
      .eq("ayah_ref_id", refId);
    if (delErr) {
      throw new Error(
        `authorities delete for ${r.verseKey}: ${delErr.message}`
      );
    }
    if (matches.length > 0) {
      const { error: insErr } = await db
        .from("ayah_scholarly_authorities")
        .insert(
          matches.map((m) => ({
            ayah_ref_id: refId,
            authority_name: m.authority,
            normalized_name: m.normalized,
            figure_id: m.figure_id,
            match_confidence: m.match_confidence,
          }))
        );
      if (insErr) {
        throw new Error(
          `authorities insert for ${r.verseKey}: ${insErr.message}`
        );
      }
    }
  }

  // ---- Outputs ----------------------------------------------------------
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fuzzyMatches.sort((a, b) => a.similarity - b.similarity);
  const unmatchedList = Array.from(unmatchedCount.entries())
    .map(([authority, occurrences]) => ({ authority, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences);
  writeFileSync(
    path.join(OUTPUT_DIR, "exact_matches.json"),
    JSON.stringify(exactMatches, null, 2)
  );
  writeFileSync(
    path.join(OUTPUT_DIR, "fuzzy_matches.json"),
    JSON.stringify(fuzzyMatches, null, 2)
  );
  writeFileSync(
    path.join(OUTPUT_DIR, "unmatched_authorities.json"),
    JSON.stringify(unmatchedList, null, 2)
  );

  console.log("─".repeat(60));
  console.log(`Refs:             ${insertedRefs.length}`);
  console.log(`Sources:          ${sourcePayload.length}`);
  console.log(`Exact matches:    ${exactMatches.length}`);
  console.log(`Fuzzy matches:    ${fuzzyMatches.length}`);
  console.log(
    `Unmatched names:  ${unmatchedList.length} ` +
      `(${Array.from(unmatchedCount.values()).reduce((a, b) => a + b, 0)} total occurrences)`
  );
  console.log("Outputs:");
  console.log(`  ${path.join(OUTPUT_DIR, "exact_matches.json")}`);
  console.log(`  ${path.join(OUTPUT_DIR, "fuzzy_matches.json")}`);
  console.log(`  ${path.join(OUTPUT_DIR, "unmatched_authorities.json")}`);
}

function classifySource(filename: string): string {
  const lower = filename.toLowerCase();
  if (
    lower.includes("tafsir") ||
    lower.includes("qurtubi") ||
    lower.includes("kathir") ||
    lower.includes("jalalayn")
  )
    return "tafsir";
  if (
    lower.includes("bukhari") ||
    lower.includes("muslim") ||
    lower.includes("hadith") ||
    lower.includes("nasai") ||
    lower.includes("dawud")
  )
    return "hadith";
  if (lower.includes("sirah") || lower.includes("seerah")) return "seerah";
  if (lower.includes("fiqh") || lower.includes("usul")) return "fiqh";
  return "other";
}

main().catch((err) => {
  console.error("[ingest] fatal:", err);
  process.exit(1);
});
