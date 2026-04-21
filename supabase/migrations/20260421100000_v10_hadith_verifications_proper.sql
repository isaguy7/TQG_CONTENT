-- V10 M1 §7 commit 1 — Fix hadith_verifications to support UNVERIFIED
-- enforcement per the product rule in V10_Product_Context.md
-- ("Hadith safety — non-negotiable": never generate hadith refs from
-- AI; every attached hadith starts UNVERIFIED until the user confirms
-- it on sunnah.com; unverified posts cannot schedule/publish).
--
-- The original hadith_verifications table predates multitenancy and
-- defaults verified=true, which inverts the product rule. This
-- migration:
--   1. Adds hadith_corpus_id FK so verifications link to a concrete
--      corpus row (not just a free-text reference_text).
--   2. Adds organization_id FK so verifications are org-scoped —
--      matches the posts/post_versions model introduced in §2.
--   3. Adds verified_by (auth.users FK) for audit trail.
--   4. Flips the default so new rows start UNVERIFIED.
--   5. Backfills organization_id on the 2 existing rows (both manually
--      vetted by Isa, so they retain verified=true).
--   6. Adds a partial unique index on (org, corpus_id) — one
--      verification per (org, corpus) pair so multiple posts in the
--      same org reuse it. Partial because the 2 legacy rows have no
--      corpus link yet and shouldn't trip the uniqueness check.
--   7. Replaces the existing service_role_all policy with the
--      standard 5-policy block used by posts/post_versions.

-- =========================================================================
-- Section 1: Add missing columns (nullable at this point)
-- =========================================================================

ALTER TABLE public.hadith_verifications
  ADD COLUMN IF NOT EXISTS hadith_corpus_id UUID
    REFERENCES public.hadith_corpus(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS verified_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- =========================================================================
-- Section 2: Flip default. ALTER COLUMN SET DEFAULT does not rewrite
-- existing rows — the 2 legacy rows keep verified=true (both vetted).
-- =========================================================================

ALTER TABLE public.hadith_verifications
  ALTER COLUMN verified SET DEFAULT false;

-- =========================================================================
-- Section 3: Backfill organization_id on the 2 legacy rows
-- and lock NOT NULL going forward.
-- =========================================================================

UPDATE public.hadith_verifications
SET organization_id = 'a1ceda74-3009-4c1d-a779-b58b9a6e65b7'
WHERE organization_id IS NULL;

DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.hadith_verifications
  WHERE organization_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % hadith_verifications rows still have NULL organization_id', orphan_count;
  END IF;
END $$;

ALTER TABLE public.hadith_verifications
  ALTER COLUMN organization_id SET NOT NULL;

-- =========================================================================
-- Section 4: Indexes
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_hadith_verifications_org_corpus_unique
  ON public.hadith_verifications(organization_id, hadith_corpus_id)
  WHERE hadith_corpus_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hadith_verifications_org_verified
  ON public.hadith_verifications(organization_id, verified);

-- =========================================================================
-- Section 5: RLS — recreate policies using the posts/post_versions
-- template. Drop-then-create the service_role_all so a replay is idempotent.
-- =========================================================================

DROP POLICY IF EXISTS "service_role_all" ON public.hadith_verifications;

CREATE POLICY "service_role_all" ON public.hadith_verifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_members_read" ON public.hadith_verifications
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_editors_insert" ON public.hadith_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin','editor')
    )
  );

CREATE POLICY "org_editors_update" ON public.hadith_verifications
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin','editor')
    )
  );

CREATE POLICY "org_admins_delete" ON public.hadith_verifications
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
  );

-- =========================================================================
-- Section 6: Log
-- =========================================================================

DO $$
BEGIN
  RAISE NOTICE 'V10 §7 commit 1: hadith_verifications schema fix complete';
END $$;
