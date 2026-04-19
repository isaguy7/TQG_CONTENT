
-- V10 M1 §2 — post_versions table for version history

CREATE TABLE public.post_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT,
  content_html TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(post_id, version)
);

CREATE INDEX idx_post_versions_post ON public.post_versions(post_id, saved_at DESC);
CREATE INDEX idx_post_versions_org ON public.post_versions(organization_id);

ALTER TABLE public.post_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.post_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_members_read" ON public.post_versions
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_editors_insert" ON public.post_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin','editor')
    )
  );

-- No UPDATE or DELETE policies — versions are immutable history.
-- Service role retains full access via service_role_all for pruning.

CREATE OR REPLACE FUNCTION public.prune_post_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.post_versions
  WHERE post_id = NEW.post_id
    AND id IN (
      SELECT id FROM public.post_versions
      WHERE post_id = NEW.post_id
      ORDER BY saved_at DESC
      OFFSET 50
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prune_post_versions
  AFTER INSERT ON public.post_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prune_post_versions();
