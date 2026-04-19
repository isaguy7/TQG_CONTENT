-- Fix mutable search_path on update_organizations_updated_at function.
-- Supabase advisor flags this as a security concern because a user with
-- schema-write access could hijack the function via search_path manipulation.
-- Setting search_path explicitly locks the function to known schemas.

CREATE OR REPLACE FUNCTION public.update_organizations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
