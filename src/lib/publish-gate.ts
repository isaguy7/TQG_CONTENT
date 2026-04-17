import "server-only";

/**
 * V2: the hadith publish gate was removed. All hadith in our corpus come from
 * established collections with sunnah.com URLs, so we no longer require a
 * per-reference "verified" toggle before a post can transition to ready.
 *
 * The function is kept as a no-op so API routes don't break if they still
 * call it during the transition. The accompanying DB triggers were dropped in
 * migration 20260417000002_drop_publish_gate.sql.
 */

export class PublishGateError extends Error {
  readonly code = "PUBLISH_GATE";
  constructor(
    public readonly unverified: Array<{ id: string; reference_text: string }>
  ) {
    super("Publish gate is disabled.");
    this.name = "PublishGateError";
  }
}

export async function assertPublishable(_postId: string): Promise<void> {
  return;
}

export function publishGateErrorBody(_err: PublishGateError) {
  return { error: "publish_gate", message: "disabled", unverified: [] };
}
