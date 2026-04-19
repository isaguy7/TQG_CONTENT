import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// §0.1 — wizard shell. Step 1 of 5 (Welcome). Steps 2-5 (platform
// connection, figure categories, guided first post) land in W8 per
// V10_M1_Plan.md §0. This page bypasses the middleware active-org gate
// so users mid-signup can reach it.

export default async function OnboardingPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("active_organization_id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const activeOrgId = (profile?.active_organization_id as string | null) ?? null;
  if (!activeOrgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-3">
          <div className="text-[15px] font-semibold text-white/90">
            No workspace found
          </div>
          <p className="text-[13px] text-white/55 leading-relaxed">
            Something went wrong during signup. Your account exists but no
            workspace was attached. Sign out and create a new account.
          </p>
          <Link
            href="/api/auth/signout"
            className="inline-flex rounded-md bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90"
          >
            Sign out
          </Link>
        </div>
      </div>
    );
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name, slug")
    .eq("id", activeOrgId)
    .maybeSingle();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-[22px] font-semibold tracking-tight text-white/90">
            TQG Studio
          </div>
          <div className="text-[11px] text-white/40 mt-1 tracking-wider uppercase">
            Step 1 of 5 · Welcome
          </div>
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-6 space-y-4">
          <div>
            <h1 className="text-[17px] font-semibold text-white/90 mb-2">
              Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}
            </h1>
            <p className="text-[13px] text-white/65 leading-relaxed">
              Your workspace{" "}
              <span className="font-semibold text-white/85">
                {org?.name ?? "(unnamed)"}
              </span>{" "}
              is ready. Let&apos;s get you set up to publish your first post.
            </p>
          </div>

          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] text-white/50 leading-relaxed">
            The rest of the onboarding wizard — connecting Typefully, picking
            figure categories, and guided first-post creation — lands in a
            later release. For now, head straight to the app.
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href="/content"
              className="w-full inline-flex items-center justify-center rounded-md bg-white px-4 py-3 text-[13px] font-medium text-black hover:bg-white/90 transition-colors"
            >
              Get started
            </Link>
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center rounded-md border border-white/[0.1] px-4 py-3 text-[13px] text-white/70 hover:text-white hover:border-white/30 transition-colors"
            >
              Skip to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
