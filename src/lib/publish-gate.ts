import "server-only";

import { getSupabaseServer } from "@/lib/supabase";

/**
 * Thrown when a caller tries to transition a post to status='ready' while
 * it has unverified hadith references. Mirrors the DB trigger installed
 * by migration 20260416000002_publish_gate.sql.
 *
 * Two layers of enforcement exist on purpose:
 *   - Node side (this file): clean API error, known error shape for UI.
 *   - DB trigger: backstop that fires even if the API is bypassed. Never
 *     remove the trigger. If this Node check is ever wrong, the DB
 *     rejects the update anyway.
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
 * verified=false. Safe to call before any mutation that sets
 * posts.status='ready'.
 */
export async function assertPublishable(postId: string): Promise<void> {
  const db = getSupabaseServer();

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
