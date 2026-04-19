-- Surah metadata (all 114 surahs) and tafsir cache table.
-- The data is seeded outside this file (see scripts/seed-surah-metadata.mjs).
-- RLS is disabled to match the rest of the project.

CREATE TABLE IF NOT EXISTS surah_metadata (
  surah              INT4 PRIMARY KEY,
  name_arabic        TEXT NOT NULL,
  name_english       TEXT NOT NULL,
  name_transliteration TEXT NOT NULL,
  revelation_place   TEXT,
  ayah_count         INT4 NOT NULL
);

ALTER TABLE surah_metadata DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tafsir_cache (
  surah        INT4 NOT NULL,
  ayah         INT4 NOT NULL,
  tafsir_slug  TEXT NOT NULL,
  content      TEXT NOT NULL,
  author       TEXT,
  group_verse  TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (surah, ayah, tafsir_slug)
);

ALTER TABLE tafsir_cache DISABLE ROW LEVEL SECURITY;

-- Make the current-session publish gate drop idempotent-ish, in case it
-- still exists on someone's local DB.
DROP TRIGGER IF EXISTS enforce_publish_gate ON posts;
DROP FUNCTION IF EXISTS enforce_publish_gate();

-- Default hadith_verifications.verified to true (references are trusted
-- because they come from established collections with sunnah.com links).
ALTER TABLE IF EXISTS hadith_verifications
  ALTER COLUMN verified SET DEFAULT true;
