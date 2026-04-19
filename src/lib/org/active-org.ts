"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Organization } from "@/types/org";

export const ACTIVE_ORG_STORAGE_KEY = "tqg.active_org_id";
const QUERY_KEY = ["active-org"] as const;

export function getActiveOrgIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(orgId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (orgId) window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
    else window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    // ignore quota / disabled-storage errors
  }
}

async function fetchActiveOrg(): Promise<Organization | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("active_organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId =
    (profile?.active_organization_id as string | null | undefined) ??
    getActiveOrgIdFromStorage();
  if (!orgId) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (org) writeStorage((org as Organization).id);
  return (org as Organization) ?? null;
}

export interface UseActiveOrgResult {
  data: Organization | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  setActiveOrg: (orgId: string) => Promise<void>;
}

export function useActiveOrg(): UseActiveOrgResult {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchActiveOrg });

  async function setActiveOrg(orgId: string): Promise<void> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Browser client runs as `authenticated`; user_updates_own_profile
    // RLS policy permits this UPDATE when user_id = auth.uid().
    const { error } = await supabase
      .from("user_profiles")
      .update({
        active_organization_id: orgId,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    if (error) throw error;

    writeStorage(orgId);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    setActiveOrg,
  };
}
