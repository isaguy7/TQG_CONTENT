-- V10 M1 §6 — Add deleted_at to islamic_figures for soft delete support.
-- Enables the DELETE handler in /api/figures/by-slug/[slug] to actually
-- work (commit 4 stubbed it as 501 pending this migration).

ALTER TABLE public.islamic_figures
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index for non-deleted queries (most common case).
-- Helps the list page + mention dropdown which always filter
-- deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_islamic_figures_not_deleted
  ON public.islamic_figures(id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'V10 §6 islamic_figures.deleted_at migration complete';
END $$;
