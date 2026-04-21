-- V10 M1 §7 commit 2 — Trigram indexes on hadith_corpus for fuzzy search.
--
-- The §7 search endpoint (/api/hadith/search) runs ILIKE '%q%'
-- against english_text / arabic_text / narrator. Without trigram
-- indexes those queries seqscan all 29,685 rows; with them they
-- turn into GIN lookups. pg_trgm is already installed (verified via
-- MCP advisor).
--
-- narrator index is partial — 11% of rows have narrator NULL (per
-- the §7 intro data audit) and NULL rows don't need to participate
-- in the index.
--
-- Storage cost is ~50-100 MB combined per Isa's estimate; trivial
-- at current scale.

CREATE INDEX IF NOT EXISTS idx_hadith_corpus_english_text_trgm
  ON public.hadith_corpus
  USING GIN (english_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_hadith_corpus_arabic_text_trgm
  ON public.hadith_corpus
  USING GIN (arabic_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_hadith_corpus_narrator_trgm
  ON public.hadith_corpus
  USING GIN (narrator gin_trgm_ops)
  WHERE narrator IS NOT NULL;

-- Exact-lookup helper for "bukhari 6018" style queries. The search
-- endpoint parses these client-side via regex, then runs a direct
-- equality query — this index makes it O(1).
CREATE INDEX IF NOT EXISTS idx_hadith_corpus_collection_number
  ON public.hadith_corpus (collection, hadith_number);

DO $$
BEGIN
  RAISE NOTICE 'V10 §7 commit 2: hadith_corpus trigram + exact-lookup indexes complete';
END $$;
