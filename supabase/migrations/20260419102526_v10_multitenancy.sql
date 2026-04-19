
-- V10 M1 Multi-tenancy
-- Adds organizations, organization_members, organization_invites.
-- Backfills "Isa Khan's Workspace" and seeds Isa as owner.
-- Dual RLS: service_role_all (primary) + user-session policies (backstop).

-- =========================================================================
-- Section 1: Tables (all three first, then policies — policies cross-reference)
-- =========================================================================

CREATE TABLE public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$'),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT organizations_name_length CHECK (char_length(name) BETWEEN 1 AND 100)
);

CREATE INDEX idx_organizations_owner ON public.organizations(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_slug ON public.organizations(slug) WHERE deleted_at IS NULL;

CREATE TABLE public.organization_members (
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  joined_at         timestamptz NOT NULL DEFAULT now(),
  invited_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usage_cap_usd     numeric(10,2),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_role ON public.organization_members(organization_id, role);

CREATE TABLE public.organization_invites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email             text NOT NULL CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role              text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  token             text NOT NULL UNIQUE,
  invited_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  CONSTRAINT invite_not_accepted_and_revoked CHECK (
    NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX idx_org_invites_org ON public.organization_invites(organization_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_org_invites_email ON public.organization_invites(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_org_invites_token ON public.organization_invites(token);

-- =========================================================================
-- Section 2: user_profiles extension
-- =========================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS active_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_user_profiles_active_org ON public.user_profiles(active_organization_id);

-- =========================================================================
-- Section 3: Enable RLS (event trigger handles new tables, but explicit is safer)
-- =========================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Section 4: Policies — service_role_all (primary)
-- =========================================================================

CREATE POLICY "service_role_all" ON public.organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.organization_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.organization_invites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =========================================================================
-- Section 5: Policies — user-session backstop for organizations
-- =========================================================================

CREATE POLICY "org_members_read" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_admins_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
  );

CREATE POLICY "org_owners_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- =========================================================================
-- Section 6: Policies — user-session backstop for organization_members
-- =========================================================================

CREATE POLICY "org_members_read_peers" ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_admins_add_members" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid()) AND om.role IN ('owner','admin')
    )
  );

CREATE POLICY "org_admins_update_members" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid()) AND om.role IN ('owner','admin')
    )
  );

CREATE POLICY "org_members_leave_or_admin_remove" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members om
      WHERE om.user_id = (SELECT auth.uid()) AND om.role IN ('owner','admin')
    )
  );

-- =========================================================================
-- Section 7: Policies — user-session backstop for organization_invites
-- =========================================================================

CREATE POLICY "org_admins_read_invites" ON public.organization_invites
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
  );

CREATE POLICY "org_admins_create_invites" ON public.organization_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
    AND invited_by = (SELECT auth.uid())
  );

CREATE POLICY "org_admins_update_invites" ON public.organization_invites
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner','admin')
    )
  );

-- =========================================================================
-- Section 8: Policies — user_profiles (add user-session policies)
-- =========================================================================

CREATE POLICY "user_reads_own_profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "user_updates_own_profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- =========================================================================
-- Section 9: updated_at trigger for organizations
-- =========================================================================

CREATE OR REPLACE FUNCTION public.update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_organizations_updated_at();

-- =========================================================================
-- Section 10: Backfill Isa's default org
-- =========================================================================

DO $$
DECLARE
  isa_user_id uuid := 'a004cb71-f78a-4f2a-8342-dea9be6a8c8a';
  new_org_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = isa_user_id) THEN
    RAISE EXCEPTION 'Backfill failed: user % does not exist in auth.users', isa_user_id;
  END IF;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES ('Isa Khan''s Workspace', 'isa-khan-workspace', isa_user_id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, invited_by)
  VALUES (new_org_id, isa_user_id, 'owner', isa_user_id);

  UPDATE public.user_profiles
  SET active_organization_id = new_org_id, updated_at = now()
  WHERE user_id = isa_user_id;

  RAISE NOTICE 'Backfill complete: org % created, Isa seeded as owner', new_org_id;
END $$;

-- =========================================================================
-- Section 11: Log
-- =========================================================================

DO $$
BEGIN
  RAISE NOTICE 'V10 multi-tenancy migration complete';
END $$;
