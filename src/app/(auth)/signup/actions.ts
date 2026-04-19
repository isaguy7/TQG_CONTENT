"use server";

import { createClient } from "@/lib/supabase/admin";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type SignUpResult =
  | { success: true; userId: string; organizationId: string }
  | { success: false; error: "validation"; message: string }
  | { success: false; error: "slug_taken" }
  | { success: false; error: "signup_failed"; message: string };

export async function signUp(formData: FormData): Promise<SignUpResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const workspaceName = String(formData.get("workspace_name") ?? "").trim();
  const workspaceSlug = String(formData.get("workspace_slug") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { success: false, error: "validation", message: "Invalid email." };
  }
  if (password.length < 8) {
    return {
      success: false,
      error: "validation",
      message: "Password must be at least 8 characters.",
    };
  }
  if (workspaceName.length < 1 || workspaceName.length > 100) {
    return {
      success: false,
      error: "validation",
      message: "Workspace name must be 1-100 characters.",
    };
  }
  if (!SLUG_PATTERN.test(workspaceSlug)) {
    return {
      success: false,
      error: "validation",
      message: "Workspace URL format is invalid.",
    };
  }

  const admin = createClient();

  // Slug uniqueness check before any user-creation side effects.
  const { data: existing, error: slugErr } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", workspaceSlug)
    .maybeSingle();
  if (slugErr) {
    return { success: false, error: "signup_failed", message: slugErr.message };
  }
  if (existing) {
    return { success: false, error: "slug_taken" };
  }

  // 1. Create the auth user. email_confirm: true skips the confirmation
  // email — V10 M1 auto-confirms; M3 will gate signup behind a verification
  // email when public launch lands.
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return {
      success: false,
      error: "signup_failed",
      message: authErr?.message ?? "Auth user creation failed.",
    };
  }
  const userId = authData.user.id;

  // 2. Create organization. If this fails, roll back the auth user so the
  // email is free for retry.
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: workspaceName, slug: workspaceSlug, owner_id: userId })
    .select("id")
    .single();
  if (orgErr || !org) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    // Race with another signup snagging the slug between our check and
    // insert collapses to a friendly slug_taken message.
    if (orgErr?.code === "23505") {
      return { success: false, error: "slug_taken" };
    }
    return {
      success: false,
      error: "signup_failed",
      message: orgErr?.message ?? "Workspace creation failed.",
    };
  }
  const organizationId = org.id as string;

  // 3. Add the user as owner. Roll back org + user if this fails.
  const { error: memberErr } = await admin
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role: "owner",
      invited_by: userId,
    });
  if (memberErr) {
    await admin.from("organizations").delete().eq("id", organizationId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return {
      success: false,
      error: "signup_failed",
      message: memberErr.message,
    };
  }

  // 4. Upsert user_profiles. The on_auth_user_created_profile trigger may
  // have already inserted a row with role='pending'; force role='member'
  // (auto-approve in M1) and stamp the active org. M3 public launch
  // re-enables the pending gate at the platform level.
  const { error: profileErr } = await admin
    .from("user_profiles")
    .upsert({
      user_id: userId,
      role: "member",
      approved_at: new Date().toISOString(),
      active_organization_id: organizationId,
      updated_at: new Date().toISOString(),
    });
  if (profileErr) {
    // Profile upsert failure is non-fatal for the auth/org pair; surface
    // the error but don't roll back — the user still has a valid account
    // and workspace, they'll just hit the role gate until an admin fixes
    // the row.
    return {
      success: false,
      error: "signup_failed",
      message: `Account and workspace created but profile setup failed: ${profileErr.message}. Contact support.`,
    };
  }

  return { success: true, userId, organizationId };
}
