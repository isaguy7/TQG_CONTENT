#!/usr/bin/env node
/**
 * Phase 4: Import all 6,236 ayahs into the `quran_cache` table.
 *
 * Idempotent — skips the whole run if the table already has 6,236 rows.
 *
 * Run with:
 *   node scripts/import-quran.mjs
 *
 * Env: requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env.local).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_TOTAL = 6236;
const BATCH_SIZE = 500;
const UTHMANI_URL = "http://api.alquran.cloud/v1/quran/quran-uthmani";
const SAHIH_URL = "http://api.alquran.cloud/v1/quran/en.sahih";

async function loadEnv() {
  try {
    const raw = await readFile(
      path.join(process.cwd(), ".env.local"),
      "utf8"
    );
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local optional if vars already in env
  }
}

// Strip harakat/tashkeel, tatweel, unify hamza/alef variants.
// Keeps Arabic letters + spaces only. Used for fuzzy trigram matching.
function normalizeArabic(input) {
  if (!input) return "";
  let s = input.normalize("NFKC");
  // Remove all Arabic diacritics U+0610-U+061A, U+064B-U+065F, U+0670, U+06D6-U+06ED
  s = s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  // Strip tatweel / kashida
  s = s.replace(/\u0640/g, "");
  // Unify alef variants -> ا
  s = s.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673]/g, "\u0627");
  // Unify yeh variants -> ي
  s = s.replace(/[\u0649\u06CC]/g, "\u064A");
  // Unify teh marbuta -> heh
  s = s.replace(/\u0629/g, "\u0647");
  // Unify waw with hamza -> waw
  s = s.replace(/\u0624/g, "\u0648");
  // Unify hamza on yeh -> yeh
  s = s.replace(/\u0626/g, "\u064A");
  // Remove standalone hamza
  s = s.replace(/\u0621/g, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function main() {
  await loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { count, error: countErr } = await db
    .from("quran_cache")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    console.error("Count check failed:", countErr.message);
    process.exit(1);
  }
  if ((count ?? 0) >= EXPECTED_TOTAL) {
    console.log(
      `quran_cache already has ${count} rows (>= ${EXPECTED_TOTAL}). Skipping.`
    );
    return;
  }
  if ((count ?? 0) > 0) {
    console.log(
      `quran_cache has ${count} rows but expected ${EXPECTED_TOTAL}. Re-running full import (upsert by verse_key).`
    );
  }

  console.log("Fetching Uthmani text…");
  const uthmani = await fetchJson(UTHMANI_URL);
  console.log("Fetching Sahih International translation…");
  const english = await fetchJson(SAHIH_URL);

  const rows = [];
  const surahs = uthmani?.data?.surahs;
  const enSurahs = english?.data?.surahs;
  if (!Array.isArray(surahs) || !Array.isArray(enSurahs)) {
    throw new Error("Unexpected API response shape");
  }

  const enAyahByKey = new Map();
  for (const s of enSurahs) {
    for (const a of s.ayahs || []) {
      enAyahByKey.set(`${s.number}:${a.numberInSurah}`, a.text);
    }
  }

  for (const s of surahs) {
    for (const a of s.ayahs || []) {
      const verseKey = `${s.number}:${a.numberInSurah}`;
      const textUthmani = String(a.text || "");
      const textSimple = normalizeArabic(textUthmani);
      rows.push({
        surah: s.number,
        ayah: a.numberInSurah,
        verse_key: verseKey,
        text_uthmani: textUthmani,
        text_simple: textSimple,
        normalized: textSimple,
        translation_en: enAyahByKey.get(verseKey) || null,
      });
    }
  }

  console.log(`Prepared ${rows.length} ayah rows. Inserting…`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db
      .from("quran_cache")
      .upsert(batch, { onConflict: "verse_key" });
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} failed:`, error.message);
      process.exit(1);
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
