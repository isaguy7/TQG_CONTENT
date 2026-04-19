"use client";

import { useState } from "react";
import { SearchCorpus, type HadithRecord } from "@/components/HadithPanel";

export interface AttachedHadithPanelProps {
  attached: HadithRecord[];
  availableHadith: HadithRecord[];
  onAttach: (hadithId: string) => void;
  onDetach: (hadithId: string) => void;
  /** Fires when a new hadith is added to the shared corpus via
   *  SearchCorpus. Parent refetches attached-list + corpus state. */
  onCorpusAdded: () => void;
}

/**
 * Hadith references panel for the post editor. Extracted from
 * /content/[id]/page.tsx during V10 §5 commit 10. Self-contained:
 * owns the corpus-drawer open state, delegates attach/detach/add to
 * the parent.
 *
 * The §7 hadith-system rewrite will absorb this component (and its
 * SearchCorpus sibling) into a more capable picker with UNVERIFIED
 * enforcement. Until then this is the minimum surface the editor page
 * needs.
 */
export function AttachedHadithPanel({
  attached,
  availableHadith,
  onAttach,
  onDetach,
  onCorpusAdded,
}: AttachedHadithPanelProps) {
  const [corpusOpen, setCorpusOpen] = useState(false);

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">
          Hadith references ({attached.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCorpusOpen((v) => !v)}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
          >
            {corpusOpen ? "Hide corpus" : "Search corpus"}
          </button>
        </div>
      </div>

      {corpusOpen ? (
        <div className="mb-4 rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
          <SearchCorpus onAdded={onCorpusAdded} />
        </div>
      ) : null}

      {attached.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No references attached. Attach from the list below or search the
          corpus.
        </div>
      ) : (
        <ul className="space-y-1 mb-4">
          {attached.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3 p-2 rounded bg-white/[0.02] border border-white/[0.04]"
            >
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
                onClick={() => onDetach(h.id)}
                className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/50 hover:text-white"
              >
                Detach
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
    </section>
  );
}
