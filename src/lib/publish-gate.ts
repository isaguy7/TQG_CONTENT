import "server-only";

import { createClient } from "@/lib/supabase/admin";

/**
 * Thrown when a caller tries to schedule/publish a post while it has
 * unverified hadith references. Historical DB trigger was dropped in
 * `20260417175934_drop_publish_gate`; V10 §7 will re-introduce the
 * trigger under the UNVERIFIED enforcement model. Until then this
 * Node-side check is the only enforcement and has no active call sites.
 */
export class PublishGateError extends Error {
  readonly code = "PUBLISH_GATE";
  constructor(
    public readonly unverified: Array<{
      id: string;
      reference_text: string;
    }>
  ) {
    super(
      `Cannot mark post ready: ${unverified.length} unverified hadith reference(s). ` +
        `Verify each on sunnah.com first.`
    );
    this.name = "PublishGateError";
  }
}

/**
 * Throws PublishGateError if the given post has any hadith refs with
 * verified=false. Safe to call before any mutation that schedules or
 * publishes a post.
 */
export async function assertPublishable(postId: string): Promise<void> {
  const db = createClient();

  const { data, error } = await db
    .from("post_hadith_refs")
    .select(
      `
      hadith_id,
      hadith_verifications!inner (
        id,
        reference_text,
        verified
      )
    `
    )
    .eq("post_id", postId);

  if (error) {
    throw new Error(`Publish gate query failed: ${error.message}`);
  }

  type HadithRow = {
    id: string;
    reference_text: string;
    verified: boolean;
  };
  type Row = { hadith_verifications: HadithRow | HadithRow[] | null };

  const unverified: Array<{ id: string; reference_text: string }> = [];
  for (const row of (data || []) as unknown as Row[]) {
    const hv = row.hadith_verifications;
    if (!hv) continue;
    // supabase join returns array-or-object depending on relationship shape;
    // handle both so the type system is happy either way.
    const items: HadithRow[] = Array.isArray(hv) ? hv : [hv];
    for (const item of items) {
      if (!item.verified) {
        unverified.push({ id: item.id, reference_text: item.reference_text });
      }
    }
  }

  if (unverified.length > 0) {
    throw new PublishGateError(unverified);
  }
}

/**
 * Shape the gate error returns as a JSON response body.
 * UI can render `unverified` as a list of refs to verify.
 */
export function publishGateErrorBody(err: PublishGateError) {
  return {
    error: "publish_gate",
    message: err.message,
    unverified: err.unverified,
  };
}
