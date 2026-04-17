/**
 * Download the six canonical hadith collections from the HuggingFace
 * `meeAtif/hadith_datasets` mirror into data/hadith/ as JSON files.
 * Idempotent — skips files already present with non-empty content.
 *
 * Run:  npx tsx scripts/download-hadith.ts
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const HF_BASE =
  "https://huggingface.co/datasets/meeAtif/hadith_datasets/resolve/main";

const FILES = [
  "Sahih al-Bukhari.json",
  "Sahih Muslim.json",
  "Sunan Abi Dawud.json",
  "Jami' at-Tirmidhi.json",
  "Sunan an-Nasa'i.json",
  "Sunan Ibn Majah.json",
];

const OUT_DIR = path.join(process.cwd(), "data", "hadith");

async function fileSize(p: string): Promise<number> {
  try {
    const s = await stat(p);
    return s.size;
  } catch {
    return 0;
  }
}

async function download(filename: string): Promise<void> {
  const outPath = path.join(OUT_DIR, filename);
  const existing = await fileSize(outPath);
  if (existing > 1024) {
    console.log(`  skip (exists, ${(existing / 1024 / 1024).toFixed(1)} MB)`);
    return;
  }

  const url = `${HF_BASE}/${encodeURIComponent(filename)}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  console.log(`  saved ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Downloading hadith JSON into ${OUT_DIR}`);
  for (const f of FILES) {
    console.log(`- ${f}`);
    await download(f);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
