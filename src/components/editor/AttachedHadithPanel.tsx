"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { type HadithRecord } from "@/components/HadithPanel";
import { HadithPicker } from "@/components/editor/HadithPicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

export type { HadithRecord };

export interface AttachedHadithPanelProps {
  /** Post whose refs this panel manages. Required for the picker's
   *  attach flow (POST /api/posts/[id]/hadith-refs). */
  postId: string;
  attached: HadithRecord[];
  availableHadith: HadithRecord[];
  onAttach: (hadithId: string) => void;
  onDetach: (hadithId: string) => void;
  /** Fires after picker attach completes so the parent can reload
   *  its attached list + available list + any derived counts. */
  onCorpusAdded: () => void;
}

/**
 * Hadith references panel for the post editor.
 *
 * §7 commit 3 rewrite: swaps the inline SearchCorpus toggle for a
 * side-drawer HadithPicker (`Add hadith` button), and wraps detach
 * in a ConfirmDialog (variant='default' — removing a link is not
 * destructive, the underlying hadith + verification rows persist).
 *
 * No UNVERIFIED badge / verify button — the corpus-picker path
 * auto-verifies per the 2026-04-21 product decision. AI-suggested
 * hadith in §9 will re-introduce that UI on rows where
 * hadith_verifications.verified = false; scoped in REFACTOR_DEBT.
 *
 * The "Attach existing reference" list (availableHadith) stays in
 * place — that's the escape-hatch for hadith added via the URL /
 * sunnah.com flows on the standalone /hadith page. Its consumers
 * will consolidate into this picker during the §9 /hadith rewrite.
 */
export function AttachedHadithPanel({
  postId,
  attached,
  availableHadith,
  onAttach,
  onDetach,
  onCorpusAdded,
}: AttachedHadithPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDetach, setPendingDetach] = useState<{
    id: string;
    label: string;
  } | null>(null);

  // The picker benefits from knowing which corpus IDs are already
  // attached so it can gray out their Attach button. Today the parent
  // doesn't pipe hadith_corpus_id through (the legacy HadithRecord
  // shape doesn't include it), so we pass an empty Set. The server
  // is idempotent (returns `already_attached: true` on dupes) and
  // the picker's local-session tracking covers the single-session
  // UX. Lift the parent's fetch to include hadith_corpus_id when
  // the §9 /hadith rewrite consolidates these flows.
  const attachedCorpusIds = new Set<string>();

  const confirmDetach = async () => {
    if (!pendingDetach) return;
    onDetach(pendingDetach.id);
    setPendingDetach(null);
  };

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">
          Hadith references ({attached.length})
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-white/70 hover:text-white hover:bg-white/[0.04]"
        >
          <Plus className="h-3 w-3" />
          Add hadith
        </button>
      </div>

      {attached.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No references attached. Click{" "}
          <span className="text-white/70">Add hadith</span> to browse the
          corpus.
        </div>
      ) : (
        <ul className="space-y-1 mb-4">
          {attached.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3 p-2 rounded bg-white/[0.02] border border-white/[0.04]"
            >
              <span
                aria-hidden
                className="text-[11px] text-[#4CAF50]"
                title="Attached"
              >
                ✓
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-white/85 truncate">
                  {h.reference_text}
                </div>
                {h.sunnah_com_url ? (
                  <a
                    href={h.sunnah_com_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-white/40 hover:text-white/70 truncate block underline underline-offset-2"
                  >
                    {h.sunnah_com_url}
                  </a>
                ) : null}
              </div>
              <button
                onClick={() =>
                  setPendingDetach({ id: h.id, label: h.reference_text })
                }
                aria-label={`Remove ${h.reference_text}`}
                className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/50 hover:text-white"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {availableHadith.length > 0 ? (
        <details className="text-[12px] text-white/70">
          <summary className="cursor-pointer hover:text-white/90 pb-2">
            Attach existing reference ({availableHadith.length} available)
          </summary>
          <ul className="space-y-1">
            {availableHadith.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-2 p-2 rounded hover:bg-white/[0.03]"
              >
                <div className="flex-1 min-w-0 truncate">
                  {h.reference_text}
                </div>
                <button
                  onClick={() => onAttach(h.id)}
                  className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
                >
                  Attach
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <HadithPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        postId={postId}
        attachedCorpusIds={attachedCorpusIds}
        onAttached={onCorpusAdded}
      />

      <ConfirmDialog
        open={!!pendingDetach}
        onOpenChange={(open) => {
          if (!open) setPendingDetach(null);
        }}
        title="Remove this hadith reference?"
        description="The hadith stays in the library. Only the link to this post is removed."
        confirmLabel="Remove"
        variant="default"
        onConfirm={confirmDetach}
      />
    </section>
  );
}
