import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

type FigureData = {
  name_en: string;
  name_ar?: string;
  type: string;
  era?: string;
  bio_short: string;
  themes: string[];
  hook_angles: Array<{ category: string; text: string }>;
  notable_events: Array<{ event: string; description: string }>;
  quran_refs: string[];
};

async function main() {
  const filePath = join(process.cwd(), "data", "islamic-figures.json");
  const raw = readFileSync(filePath, "utf-8");
  const figures: FigureData[] = JSON.parse(raw);

  console.log(`Seeding ${figures.length} figures...`);

  for (const fig of figures) {
    const { data: existing } = await db
      .from("islamic_figures")
      .select("id")
      .eq("name_en", fig.name_en)
      .maybeSingle();

    const row = {
      name_en: fig.name_en,
      name_ar: fig.name_ar || null,
      type: fig.type,
      era: fig.era || null,
      bio_short: fig.bio_short,
      themes: fig.themes,
      hook_angles: fig.hook_angles,
      notable_events: fig.notable_events,
      quran_refs: fig.quran_refs,
    };

    if (existing) {
      const { error } = await db
        .from("islamic_figures")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) {
        console.error(`  ✗ ${fig.name_en}: ${error.message}`);
      } else {
        console.log(`  ↻ ${fig.name_en} (updated)`);
      }
    } else {
      const { error } = await db.from("islamic_figures").insert(row);
      if (error) {
        console.error(`  ✗ ${fig.name_en}: ${error.message}`);
      } else {
        console.log(`  ✓ ${fig.name_en} (created)`);
      }
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
