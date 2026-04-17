// Plain ESM — works with Node 24, no tsx needed
// Usage: node download_hadith_node24.mjs
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const HF = 'https://huggingface.co/datasets/meeAtif/hadith_datasets/resolve/main';
const FILES = [
  'Sahih al-Bukhari.json',
  'Sahih Muslim.json',
  'Sunan Abi Dawud.json',
  "Jami' at-Tirmidhi.json",
  "Sunan an-Nasa'i.json",
  'Sunan Ibn Majah.json',
];
const DIR = join(process.cwd(), 'data', 'hadith');

await mkdir(DIR, { recursive: true });
console.log('Downloading hadith JSON into', DIR);

for (const f of FILES) {
  const out = join(DIR, f);
  try {
    const s = await stat(out);
    if (s.size > 1024) { console.log(`- ${f}: skip (${(s.size/1024/1024).toFixed(1)} MB)`); continue; }
  } catch {}
  
  console.log(`- ${f}: downloading...`);
  const url = `${HF}/${encodeURIComponent(f)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) { console.error(`  HTTP ${res.status}`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(out, buf);
  console.log(`  saved ${(buf.length/1024/1024).toFixed(1)} MB`);
}
console.log('Done.');
