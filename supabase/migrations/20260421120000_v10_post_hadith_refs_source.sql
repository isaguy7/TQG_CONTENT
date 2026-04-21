-- V10 M1 §7 commit 3 — Add source column to post_hadith_refs.
--
-- Tracks where the hadith citation came from:
--   'corpus_picker'  — user consciously picked from the 29K-row
--                      hadith_corpus library (auto-verified in
--                      hadith_verifications since no AI hallucination
--                      risk; see decision 2026-04-21).
--   'ai_suggestion'  — Claude-suggested in §9's AI assistant flow.
--                      Needs user confirmation via sunnah.com before
--                      the post can be scheduled/published (§7
--                      publish-gate picks this up via the
--                      verified=false flag on the linked verification
--                      row).
--
-- Not strictly required for M1 functionality (hadith_verifications.
-- verified carries the semantic alone), but recording source on the
-- junction is the cleanest data model — source of truth for "where
-- did this citation come from" lives on the link, not derived from
-- an adjacent table. Also unlocks later analytics (AI-suggestion
-- acceptance rates).
--
-- 0 existing rows in post_hadith_refs per the §7 intro data audit,
-- so the NOT NULL DEFAULT 'corpus_picker' has nothing to backfill.
-- DEFAULT stays on the column so old code paths that don't specify
-- source continue to work.

ALTER TABLE public.post_hadith_refs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'corpus_picker'
    CHECK (source IN ('corpus_picker', 'ai_suggestion'));

DO $$
BEGIN
  RAISE NOTICE 'V10 §7 commit 3: post_hadith_refs.source column added';
END $$;
