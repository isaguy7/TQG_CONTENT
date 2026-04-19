export type OrgRole = "owner" | "admin" | "editor" | "viewer";
export type InviteRole = "admin" | "editor" | "viewer";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: OrgRole;
  joined_at: string;
  invited_by: string | null;
  usage_cap_usd: number | null;
}

export interface OrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  role: InviteRole;
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
