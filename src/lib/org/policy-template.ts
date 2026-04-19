/**
 * Standard RLS-policy block for any table that adds an `organization_id`
 * column and becomes org-scoped. Documentation-as-code — not used at
 * runtime. Migration authors copy the resolved SQL into their migration
 * file by hand, substituting `{table}` with the real table name.
 *
 * Role matrix:
 *   SELECT: any member (owner / admin / editor / viewer)
 *   INSERT: editor+
 *   UPDATE: editor+
 *   DELETE: admin+
 *
 * `service_role_all` remains the primary path for server-side admin
 * queries; the user-session policies below are the backstop that
 * enforces tenancy if anon/authenticated ever bypass the admin client.
 */
export const ORG_SCOPED_POLICY_TEMPLATE = `
CREATE POLICY "service_role_all" ON public.{table}
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "org_members_read" ON public.{table}
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "org_editors_insert" ON public.{table}
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner','admin','editor')
    )
  );

CREATE POLICY "org_editors_update" ON public.{table}
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner','admin','editor')
    )
  );

CREATE POLICY "org_admins_delete" ON public.{table}
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner','admin')
    )
  );
` as const;
