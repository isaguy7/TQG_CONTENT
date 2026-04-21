import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/admin";

/**
 * Publish-gate — blocks status transitions to `scheduled` / `published`
 * while a post has any blockers.
 *
 * M1 only wires one blocker code: UNVERIFIED_HADITH. Corpus-picker
 * attachments auto-verify (§7 commit 3) so the gate is a no-op in
 * the corpus-only path; this is defense-in-depth for §9's AI
 * suggestions (which insert hadith_verifications with verified=false
 * and post_hadith_refs with source='ai_suggestion'). Future
 * milestones add more codes (EMPTY_CONTENT, MISSING_PLATFORM, etc.)
 * without rewiring the consuming routes — both the PATCH rejection
 * path and the GET /publish-check endpoint share this one helper.
 */

export type BlockerCode = "UNVERIFIED_HADITH";

export interface Blocker {
  code: BlockerCode;
  count: number;
  /** Present when `code === 'UNVERIFIED_HADITH'` — the distinct
   *  `post_hadith_refs.source` values among the unverified refs.
   *  Lets the UI say e.g. "from AI suggestions" vs the picker. */
  sources?: Array<"corpus_picker" | "ai_suggestion">;
  /** UI-ready copy; renders unchanged in error toasts + dropdown
   *  tooltips. */
  message: string;
}

export interface PublishGateResult {
  ready_to_publish: boolean;
  blockers: Blocker[];
}

/** Legacy error class — retained for back-compat (no active callers
 *  today per the pre-V10 comment). checkPublishGate() is the new
 *  surface. */
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

/** Legacy helper — retained for back-compat. */
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

/** Legacy helper — retained for back-compat. */
export function publishGateErrorBody(err: PublishGateError) {
  return {
    error: "publish_gate",
    message: err.message,
    unverified: err.unverified,
  };
}

/**
 * Structured publish-gate check used by PATCH /api/posts/[id] (on
 * status transitions to scheduled/published) and GET
 * /api/posts/[id]/publish-check (proactive UI).
 *
 * Returns all blockers at once, not short-circuiting, so the UI can
 * render a complete list rather than fixing them one at a time.
 */
export async function checkPublishGate(
  db: SupabaseClient,
  postId: string
): Promise<PublishGateResult> {
  const blockers: Blocker[] = [];

  // UNVERIFIED_HADITH: count post_hadith_refs whose linked
  // hadith_verifications.verified = false, and collect the distinct
  // sources among them. .eq() on the embedded column is supported by
  // PostgREST's filter-through-join syntax.
  const { data, error } = await db
    .from("post_hadith_refs")
    .select(
      `
      source,
      hadith_verifications!inner (verified)
    `
    )
    .eq("post_id", postId)
    .eq("hadith_verifications.verified", false);

  if (error) {
    throw new Error(`Publish gate query failed: ${error.message}`);
  }

  const unverifiedRows = (data ?? []) as unknown as Array<{
    source: "corpus_picker" | "ai_suggestion";
  }>;
  if (unverifiedRows.length > 0) {
    const sourceSet = new Set<"corpus_picker" | "ai_suggestion">();
    unverifiedRows.forEach((r) => sourceSet.add(r.source));
    const sources = Array.from(sourceSet);
    blockers.push({
      code: "UNVERIFIED_HADITH",
      count: unverifiedRows.length,
      sources,
      message: formatUnverifiedMessage(unverifiedRows.length, sources),
    });
  }

  return {
    ready_to_publish: blockers.length === 0,
    blockers,
  };
}

function formatUnverifiedMessage(
  count: number,
  sources: Array<"corpus_picker" | "ai_suggestion">
): string {
  const plural = count === 1 ? "reference" : "references";
  const sourceLabel =
    sources.length === 1
      ? sources[0] === "ai_suggestion"
        ? " from AI suggestions"
        : " from the corpus picker"
      : "";
  return `${count} unverified hadith ${plural}${sourceLabel}`;
}
