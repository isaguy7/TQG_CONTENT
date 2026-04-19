
-- V10 M1 §2 — Post data model: status collapse + new columns + org scoping

-- Section 1: Drop status CHECK, collapse legacy values, re-add CHECK
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;

UPDATE public.posts
SET status = 'draft'
WHERE status IN ('drafting', 'review', 'ready');

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('idea','draft','scheduled','published','failed','archived'));

-- Section 2: Drop obsolete columns (IF EXISTS — most won't exist)
ALTER TABLE public.posts DROP COLUMN IF EXISTS quality_score;
ALTER TABLE public.posts DROP COLUMN IF EXISTS quality_label;
ALTER TABLE public.posts DROP COLUMN IF EXISTS readiness;
ALTER TABLE public.posts DROP COLUMN IF EXISTS review_status;
ALTER TABLE public.posts DROP COLUMN IF EXISTS linkedin_status;
ALTER TABLE public.posts DROP COLUMN IF EXISTS x_status;
ALTER TABLE public.posts DROP COLUMN IF EXISTS facebook_status;
ALTER TABLE public.posts DROP COLUMN IF EXISTS instagram_status;

-- Section 3: Add new columns
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hook_category TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS hook_text TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Section 4: Backfill platforms from existing singular platform column
UPDATE public.posts
SET platforms = ARRAY[platform]
WHERE platforms IS NULL OR platforms = '{}'::TEXT[];

COMMENT ON COLUMN public.posts.platform IS 'DEPRECATED — use platforms[] array. Removed in M2 after stability verified.';

-- Section 5: Hook category CHECK
ALTER TABLE public.posts
  ADD CONSTRAINT posts_hook_category_check
  CHECK (hook_category IS NULL OR hook_category IN
    ('contrast','provocative','scene','purpose','refusal','dua','scale','loss','character'));

-- Section 6: organization_id — add nullable, backfill, lock NOT NULL
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.posts p
SET organization_id = (
  SELECT up.active_organization_id
  FROM public.user_profiles up
  WHERE up.user_id = p.user_id
)
WHERE p.organization_id IS NULL;

DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT count(*) INTO orphan_count FROM public.posts WHERE organization_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows still have NULL organization_id', orphan_count;
  END IF;
END $$;

ALTER TABLE public.posts ALTER COLUMN organization_id SET NOT NULL;

-- Section 7: Indexes
CREATE INDEX IF NOT EXISTS idx_posts_org_status ON public.posts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_org_figure ON public.posts(organization_id, figure_id) WHERE figure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON public.posts(scheduled_for) WHERE status = 'scheduled';

-- Section 8: Replace policies — drop service_role_all, add dual-role 5-policy block
DROP POLICY IF EXISTS "service_role_all" ON public.posts;

CREATE POLICY "service_role_all" ON public.posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_members_read" ON public.posts
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_editors_insert" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin','editor')
    )
  );

CREATE POLICY "org_editors_update" ON public.posts
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin','editor')
    )
  );

CREATE POLICY "org_admins_delete" ON public.posts
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
  );

-- Section 9: Log
DO $$
BEGIN
  RAISE NOTICE 'V10 post status model migration complete';
END $$;
