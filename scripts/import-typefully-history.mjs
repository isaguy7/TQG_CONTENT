#!/usr/bin/env node
/**
 * Backfill posts from Typefully's "recently published" list.
 *
 * Run: `node scripts/import-typefully-history.mjs`
 *
 * Environment needed:
 *   TYPEFULLY_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Duplicates are skipped by matching the first 200 characters of the draft
 * content against existing rows. Posts are inserted with status=published
 * and platform=x (Typefully exclusively publishes to X).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // no .env.local — rely on the caller's env
  }
}

loadEnv();

const TYPEFULLY_KEY = process.env.TYPEFULLY_API_KEY?.trim();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!TYPEFULLY_KEY) {
  console.error("TYPEFULLY_API_KEY is missing. Set it in .env.local.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function listRecentlyPublished() {
  const res = await fetch(
    "https://api.typefully.com/v1/drafts/recently-published/",
    {
      headers: {
        "X-API-KEY": `Bearer ${TYPEFULLY_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Typefully ${res.status} ${res.statusText}: ${body.slice(0, 300)}`
    );
  }
  return res.json();
}

function contentFingerprint(content) {
  return (content || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

async function main() {
  console.log("Fetching Typefully published drafts…");
  const drafts = await listRecentlyPublished();
  if (!Array.isArray(drafts)) {
    console.error("Unexpected Typefully response:", drafts);
    process.exit(2);
  }
  console.log(`Found ${drafts.length} published drafts.`);

  let imported = 0;
  let skipped = 0;

  for (const draft of drafts) {
    const content = draft.content || draft.text || "";
    if (!content.trim()) {
      skipped++;
      continue;
    }
    const fingerprint = contentFingerprint(content);

    // Skip duplicates — match on the leading 200 chars of final_content.
    const { data: existing } = await db
      .from("posts")
      .select("id")
      .ilike("final_content", `${fingerprint}%`)
      .limit(1);
    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const firstLine = content.split(/\r?\n/)[0].trim().slice(0, 100);
    const publishedAt =
      draft.published_date ||
      draft.scheduled_date ||
      draft.created_at ||
      new Date().toISOString();

    const row = {
      title: firstLine || "Imported from Typefully",
      final_content: content,
      status: "published",
      platform: "x",
      published_at: publishedAt,
      created_at: publishedAt,
    };

    const { error } = await db.from("posts").insert(row);
    if (error) {
      console.error(
        `Insert failed for draft ${draft.id || "?"}: ${error.message}`
      );
      continue;
    }
    imported++;
    console.log(`· imported: ${firstLine}`);
  }

  console.log(
    `\nDone. Imported ${imported}, skipped ${skipped} (duplicates or empty).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
