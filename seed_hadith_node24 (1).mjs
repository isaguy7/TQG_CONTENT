// Plain ESM script — works with Node 24 directly, no tsx needed
// Usage: node seed_hadith_node24.mjs
// Requires: .env.local with Supabase credentials in the project root
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (no @next/env needed)
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase env vars'); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });

const COLLECTIONS = [
  { file: 'Sahih al-Bukhari.json', slug: 'bukhari', name: 'Sahih al-Bukhari' },
  { file: 'Sahih Muslim.json', slug: 'muslim', name: 'Sahih Muslim' },
  { file: 'Sunan Abi Dawud.json', slug: 'abudawud', name: 'Sunan Abi Dawud' },
  { file: "Jami' at-Tirmidhi.json", slug: 'tirmidhi', name: "Jami' at-Tirmidhi" },
  { file: "Sunan an-Nasa'i.json", slug: 'nasai', name: "Sunan an-Nasa'i" },
  { file: 'Sunan Ibn Majah.json', slug: 'ibnmajah', name: 'Sunan Ibn Majah' },
];

const DATA_DIR = join(process.cwd(), 'data', 'hadith');
const BATCH = 500;

function extractNarrator(text) {
  const idx = text.indexOf(':');
  if (idx === -1 || idx > 200) return { narrator: null, text };
  return { narrator: text.slice(0, idx).trim(), text: text.slice(idx + 1).trim() };
}

function hadithNum(ref, fallback) {
  const m = (ref || '').match(/:(\d+)/);
  return m ? Number(m[1]) : fallback;
}

for (const { file, slug, name } of COLLECTIONS) {
  const filePath = join(DATA_DIR, file);
  console.log(`\n=== ${name} ===`);
  let raw;
  try { raw = JSON.parse(readFileSync(filePath, 'utf-8')); }
  catch { console.log('  skip — file not found. Run download first.'); continue; }

  const { count } = await db.from('hadith_corpus').select('*', { count: 'exact', head: true }).eq('collection', slug);
  if (count === raw.length) { console.log(`  already imported (${count}) — skip`); continue; }
  if (count > 0) {
    console.log(`  partial ${count}/${raw.length} — wiping`);
    await db.from('hadith_corpus').delete().eq('collection', slug);
  }

  const rows = raw.map((r, i) => {
    const { narrator } = extractNarrator(r.English_Text || '');
    const ch = parseInt(r.Chapter_Number);
    return {
      collection: slug, collection_name: name,
      hadith_number: hadithNum(r.Reference, i + 1),
      chapter_number: isNaN(ch) ? null : ch,
      chapter_title_en: (r.Chapter_Title_English || '').trim() || null,
      chapter_title_ar: (r.Chapter_Title_Arabic || '').trim() || null,
      arabic_text: r.Arabic_Text || '',
      english_text: r.English_Text || '',
      narrator, grade: (r.Grade || '').trim() || null,
      sunnah_com_url: (r.Reference || '').trim() || null,
      in_book_reference: (r['In-book reference'] || '').trim() || null,
    };
  });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from('hadith_corpus').insert(chunk);
    if (error) { console.error(`  insert error at ${i}: ${error.message}`); process.exit(1); }
    inserted += chunk.length;
    console.log(`  ${inserted}/${rows.length}`);
  }
}

const { count: total } = await db.from('hadith_corpus').select('*', { count: 'exact', head: true });
console.log(`\nTotal: ${total}`);
