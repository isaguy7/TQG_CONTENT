/**
 * Import the six hadith collections from data/hadith/*.json into the
 * hadith_corpus table. Idempotent: if a collection already has the
 * expected number of rows it is skipped. Batches inserts in chunks of
 * 500 to stay under Supabase payload limits.
 *
 * Run:  npx tsx scripts/seed-hadith.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type RawHadith = {
  Book: string;
  Chapter_Number: number | string;
  Chapter_Title_Arabic: string;
  Chapter_Title_English: string;
  Arabic_Text: string;
  English_Text: string;
  Grade: string;
  Reference: string;
  "In-book reference": string;
};

type CorpusRow = {
  collection: string;
  collection_name: string;
  hadith_number: number;
  chapter_number: number | null;
  chapter_title_en: string | null;
  chapter_title_ar: string | null;
  arabic_text: string;
  english_text: string;
  narrator: string | null;
  grade: string | null;
  sunnah_com_url: string | null;
  in_book_reference: string | null;
};

const COLLECTIONS: Array<{ file: string; slug: string; name: string }> = [
  { file: "Sahih al-Bukhari.json", slug: "bukhari", name: "Sahih al-Bukhari" },
  { file: "Sahih Muslim.json", slug: "muslim", name: "Sahih Muslim" },
  { file: "Sunan Abi Dawud.json", slug: "abudawud", name: "Sunan Abi Dawud" },
  { file: "Jami' at-Tirmidhi.json", slug: "tirmidhi", name: "Jami' at-Tirmidhi" },
  { file: "Sunan an-Nasa'i.json", slug: "nasai", name: "Sunan an-Nasa'i" },
  { file: "Sunan Ibn Majah.json", slug: "ibnmajah", name: "Sunan Ibn Majah" },
];

const DATA_DIR = path.join(process.cwd(), "data", "hadith");
const BATCH_SIZE = 500;

function extractNarrator(englishText: string): {
  narrator: string | null;
  text: string;
} {
  const idx = englishText.indexOf(":");
  if (idx === -1) return { narrator: null, text: englishText };
  const head = englishText.slice(0, idx).trim();
  const tail = englishText.slice(idx + 1).trim();
  if (head.length === 0 || head.length > 200) {
    return { narrator: null, text: englishText };
  }
  return { narrator: head, text: tail };
}

function hadithNumberFromRef(ref: string, fallback: number): number {
  const m = ref.match(/:(\d+)(?:$|\/)/);
  if (m) return Number(m[1]);
  return fallback;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toRows(
  raw: RawHadith[],
  slug: string,
  name: string
): CorpusRow[] {
  return raw.map((r, i) => {
    const { narrator, text } = extractNarrator(r.English_Text || "");
    const number = hadithNumberFromRef(r.Reference || "", i + 1);
    return {
      collection: slug,
      collection_name: name,
      hadith_number: number,
      chapter_number: toInt(r.Chapter_Number),
      chapter_title_en: r.Chapter_Title_English?.trim() || null,
      chapter_title_ar: r.Chapter_Title_Arabic?.trim() || null,
      arabic_text: r.Arabic_Text || "",
      english_text: r.English_Text || "",
      narrator,
      grade: r.Grade?.trim() ? r.Grade.trim() : null,
      sunnah_com_url: r.Reference?.trim() || null,
      in_book_reference: r["In-book reference"]?.trim() || null,
    };
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const { file, slug, name } of COLLECTIONS) {
    const filePath = path.join(DATA_DIR, file);
    console.log(`\n=== ${name} (${slug}) ===`);
    let raw: RawHadith[];
    try {
      const buf = await readFile(filePath, "utf8");
      raw = JSON.parse(buf) as RawHadith[];
    } catch (err) {
      console.error(
        `  skip — cannot read ${file}. Run scripts/download-hadith.ts first.`
      );
      continue;
    }
    const rows = toRows(raw, slug, name);
    console.log(`  parsed ${rows.length} rows`);

    const { count, error: countErr } = await db
      .from("hadith_corpus")
      .select("*", { count: "exact", head: true })
      .eq("collection", slug);
    if (countErr) {
      console.error(`  count failed: ${countErr.message}`);
      continue;
    }
    if ((count ?? 0) === rows.length) {
      console.log(`  already imported (${count} rows) — skipping`);
      continue;
    }
    if ((count ?? 0) > 0 && (count ?? 0) !== rows.length) {
      console.log(
        `  partial (${count}/${rows.length}) — wiping and re-importing`
      );
      const { error: delErr } = await db
        .from("hadith_corpus")
        .delete()
        .eq("collection", slug);
      if (delErr) {
        console.error(`  delete failed: ${delErr.message}`);
        continue;
      }
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await db.from("hadith_corpus").insert(chunk);
      if (insErr) {
        console.error(`  insert failed at ${i}: ${insErr.message}`);
        process.exit(1);
      }
      inserted += chunk.length;
      console.log(`  ${inserted}/${rows.length}`);
    }
  }

  const { count: total } = await db
    .from("hadith_corpus")
    .select("*", { count: "exact", head: true });
  console.log(`\nTotal rows in hadith_corpus: ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
