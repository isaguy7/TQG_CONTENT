-- V10 M1 §8 commit 0 — NotebookLM scholarly ingest schema.
--
-- Three read-only reference tables populated one-time from
-- data/notebooklm/Islamic_Jurisprudence_and_Qur_anic_Commentary_Data_Table.xlsx
-- (62 scholarly ayah-refs × 8 columns + 28-row source-reference sheet).
-- See §8 kickoff spec for fuzzy-match rules (authority → islamic_figures)
-- and scripts/ingest-notebooklm.ts for the ingest logic.
--
-- Reference data, not org-scoped — authenticated-read RLS only.

-- =========================================================================
-- Section 1: source_references — sheet 2 lookup (28 rows)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.source_references (
  id               serial PRIMARY KEY,
  reference_index  integer UNIQUE NOT NULL,
  display_name     text NOT NULL,
  filename         text,
  source_type      text CHECK (source_type IN ('tafsir','hadith','seerah','fiqh','other'))
);

-- =========================================================================
-- Section 2: ayah_scholarly_refs — one row per (verse_key, legal_subject).
-- Verse ranges stored as ayah_start/ayah_end inclusive; ingest expands
-- "2:178-179" style entries into start=178, end=179, verse_key="2:178-179".
-- Single-ayah entries set ayah_end = ayah_start and verse_key like "2:142".
-- UNIQUE (verse_key, legal_subject) lets the ingest re-run idempotently.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.ayah_scholarly_refs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verse_key           text NOT NULL,
  surah               integer NOT NULL,
  ayah_start          integer NOT NULL,
  ayah_end            integer NOT NULL,
  legal_subject       text NOT NULL,
  ruling_strategy     text,
  asbab_al_nuzul      text,
  hadith_cited        text,
  linguistic_feature  text,
  source_indices      integer[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ayah_scholarly_refs_ayah_range_check
    CHECK (ayah_end >= ayah_start),
  CONSTRAINT ayah_scholarly_refs_unique_verse_subject
    UNIQUE (verse_key, legal_subject)
);

-- =========================================================================
-- Section 3: ayah_scholarly_authorities — one row per named authority
-- per ayah_scholarly_refs row. figure_id left NULL when the fuzzy matcher
-- falls below threshold (match_confidence='unmatched'); Isa reviews those
-- via scripts/unmatched_authorities.json and backfills manually.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.ayah_scholarly_authorities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ayah_ref_id       uuid NOT NULL REFERENCES public.ayah_scholarly_refs(id) ON DELETE CASCADE,
  authority_name    text NOT NULL,
  normalized_name   text NOT NULL,
  figure_id         uuid REFERENCES public.islamic_figures(id) ON DELETE SET NULL,
  match_confidence  text NOT NULL CHECK (match_confidence IN ('exact','fuzzy','unmatched'))
);

-- =========================================================================
-- Section 4: Indexes
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_scholarly_refs_surah_ayah
  ON public.ayah_scholarly_refs (surah, ayah_start, ayah_end);

CREATE INDEX IF NOT EXISTS idx_scholarly_refs_legal_subject_trgm
  ON public.ayah_scholarly_refs USING GIN (legal_subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_scholarly_authorities_figure
  ON public.ayah_scholarly_authorities (figure_id)
  WHERE figure_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scholarly_authorities_ref
  ON public.ayah_scholarly_authorities (ayah_ref_id);

-- =========================================================================
-- Section 5: RLS — authenticated-read on all three (shared reference data)
-- =========================================================================

ALTER TABLE public.source_references            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ayah_scholarly_refs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ayah_scholarly_authorities   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.source_references
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.ayah_scholarly_refs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.ayah_scholarly_authorities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.source_references
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.ayah_scholarly_refs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.ayah_scholarly_authorities
  FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- Section 6: Log
-- =========================================================================

DO $$
BEGIN
  RAISE NOTICE 'V10 §8 commit 0: NotebookLM ingest schema ready';
END $$;
