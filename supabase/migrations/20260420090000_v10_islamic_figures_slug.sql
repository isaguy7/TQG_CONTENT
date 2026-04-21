-- V10 M1 §6 — Add slug to islamic_figures for mentions and URLs.
-- Populate from existing name_en; slug becomes the canonical human
-- identifier. Mentions (editor §5) will switch from uuid to slug in a
-- follow-up code change once this migration lands in prod.

ALTER TABLE public.islamic_figures
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Populate: lowercase name_en, collapse any run of non-alphanumeric
-- chars to a single hyphen, then trim leading/trailing hyphens.
-- The single-pass non-alphanumeric collapse (`+` quantifier) guarantees
-- no consecutive hyphens — matches the CHECK constraint added below.
UPDATE public.islamic_figures
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(name_en, '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+)|(-+$)', '', 'g'
  )
)
WHERE slug IS NULL;

-- Collision guard. The 15 seeded figures have distinct enough name_en
-- values (Abu Bakr As-Siddiq, Umar ibn al-Khattab, etc.) that this
-- should be a no-op, but we fail loud if the assumption breaks.
DO $$
DECLARE
  collision_count INT;
BEGIN
  SELECT COUNT(*) - COUNT(DISTINCT slug) INTO collision_count
  FROM public.islamic_figures
  WHERE slug IS NOT NULL;

  IF collision_count > 0 THEN
    RAISE EXCEPTION 'Slug collisions detected: %. Manual deduplication required before applying UNIQUE constraint.', collision_count;
  END IF;
END $$;

ALTER TABLE public.islamic_figures
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT islamic_figures_slug_unique UNIQUE (slug),
  ADD CONSTRAINT islamic_figures_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  );

CREATE INDEX IF NOT EXISTS idx_islamic_figures_slug
  ON public.islamic_figures(slug);

DO $$
BEGIN
  RAISE NOTICE 'V10 §6 islamic_figures.slug migration complete';
END $$;
