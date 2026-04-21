"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HadithCorpus } from "@/types/hadith";

const COLLECTIONS: Array<{ slug: "" | HadithCorpus["collection"]; label: string }> = [
  { slug: "", label: "All" },
  { slug: "bukhari", label: "Bukhari" },
  { slug: "muslim", label: "Muslim" },
  { slug: "abudawud", label: "Abu Dawud" },
  { slug: "ibnmajah", label: "Ibn Majah" },
  { slug: "nasai", label: "Nasa'i" },
];

const GRADE_PILL: Record<string, string> = {
  sahih: "bg-green-500/10 text-green-400 border-green-500/20",
  hasan: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  daif: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  mawdu: "bg-red-500/10 text-red-400 border-red-500/20",
};

export interface HadithPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  /** Corpus IDs already attached to this post — used to disable
   *  the Attach button inline. */
  attachedCorpusIds: Set<string>;
  /** Fires after a successful attach so the caller can refetch its
   *  attached list. Drawer stays open for multi-attach. */
  onAttached: () => void;
}

export function HadithPicker({
  open,
  onOpenChange,
  postId,
  attachedCorpusIds,
  onAttached,
}: HadithPickerProps) {
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<string>("");
  const [results, setResults] = useState<HadithCorpus[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** IDs attached during this drawer session — merges with the
   *  parent-provided `attachedCorpusIds` for instant UI feedback
   *  before the parent refetch round-trips. */
  const [localAttached, setLocalAttached] = useState<Set<string>>(new Set());

  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Focus the search input when the drawer opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  // Clear local state when the drawer closes so the next open starts fresh.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setCollection("");
    setResults(null);
    setTotal(0);
    setSearchError(null);
    setAttachError(null);
    setLocalAttached(new Set());
  }, [open]);

  // Debounced search. Fires on deferredQuery changes; skips < 3 chars
  // to match the server's validation + save a round-trip.
  useEffect(() => {
    if (!open) return;
    const q = deferredQuery.trim();
    if (q.length < 3) {
      setResults(null);
      setTotal(0);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError(null);
    const params = new URLSearchParams({ q, limit: "50" });
    if (collection) params.set("collection", collection);
    fetch(`/api/hadith/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          results?: HadithCorpus[];
          total?: number;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setSearchError(json.message ?? json.error ?? `HTTP ${res.status}`);
          setResults([]);
          setTotal(0);
          return;
        }
        setResults(json.results ?? []);
        setTotal(json.total ?? 0);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setSearchError(err.message);
        setResults([]);
        setTotal(0);
      })
      .finally(() => setSearching(false));
    return () => controller.abort();
  }, [open, deferredQuery, collection]);

  const attach = useCallback(
    async (corpus: HadithCorpus) => {
      setAttachingId(corpus.id);
      setAttachError(null);
      try {
        const res = await fetch(`/api/posts/${postId}/hadith-refs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hadith_corpus_id: corpus.id }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(
            json.message ?? json.error ?? `HTTP ${res.status}`
          );
        }
        setLocalAttached((prev) => new Set(prev).add(corpus.id));
        onAttached();
      } catch (err) {
        setAttachError((err as Error).message);
      } finally {
        setAttachingId(null);
      }
    },
    [postId, onAttached]
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onOpenChange(false);
  };

  const effectiveAttached = useMemo(() => {
    const merged = new Set(attachedCorpusIds);
    localAttached.forEach((id) => merged.add(id));
    return merged;
  }, [attachedCorpusIds, localAttached]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onMouseDown={onBackdropClick}
      onKeyDown={onKeyDown}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Hadith picker"
        className="flex h-full w-full max-w-xl flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Add hadith</h2>
            <p className="text-[11px] text-zinc-500">
              Browse the 29K-hadith corpus. Picks are auto-verified.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + filter */}
        <div className="space-y-2 border-b border-zinc-800 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search text, narrator, or "bukhari 6018"…'
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {COLLECTIONS.map((c) => (
              <button
                key={c.slug || "all"}
                type="button"
                onClick={() => setCollection(c.slug)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  collection === c.slug
                    ? "bg-[#1B5E20] border-[#1B5E20] text-white"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          {attachError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
              {attachError}
            </div>
          ) : null}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {query.trim().length < 3 ? (
            <div className="py-12 text-center text-[12px] text-zinc-500">
              Type at least 3 characters to search.
            </div>
          ) : searching ? (
            <div className="py-12 text-center text-[12px] text-zinc-500">
              <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
              Searching…
            </div>
          ) : searchError ? (
            <div className="py-8 text-center text-[12px] text-red-400">
              {searchError}
            </div>
          ) : results === null || results.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-zinc-500">
              No results. Try different keywords.
            </div>
          ) : (
            <>
              <div className="mb-3 text-[11px] text-zinc-500">
                {total} result{total === 1 ? "" : "s"}
                {total > results.length ? ` (showing first ${results.length})` : ""}
              </div>
              <ul className="space-y-2">
                {results.map((h) => (
                  <ResultCard
                    key={h.id}
                    hadith={h}
                    attached={effectiveAttached.has(h.id)}
                    attaching={attachingId === h.id}
                    onAttach={() => attach(h)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ResultCard({
  hadith: h,
  attached,
  attaching,
  onAttach,
}: {
  hadith: HadithCorpus;
  attached: boolean;
  attaching: boolean;
  onAttach: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const TRUNCATE_AT = 300;
  const isLong = h.english_text.length > TRUNCATE_AT;
  const shownText =
    expanded || !isLong ? h.english_text : h.english_text.slice(0, TRUNCATE_AT) + "…";

  const gradePill = h.grade ? GRADE_PILL[h.grade.toLowerCase()] ?? GRADE_PILL.hasan : null;

  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-white">
            {h.collection_name} <span className="text-zinc-400">#{h.hadith_number}</span>
          </div>
          {h.chapter_title_en ? (
            <div className="mt-0.5 text-[11px] text-zinc-500 truncate">
              {h.chapter_title_en}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {h.grade && gradePill ? (
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", gradePill)}>
              {h.grade}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-[12px] text-zinc-300 leading-relaxed whitespace-pre-line">
        {shownText}
        {isLong ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-[11px] text-[#4CAF50] hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </p>

      {h.arabic_text ? (
        <p
          dir="rtl"
          className="mt-2 text-[12px] text-zinc-400 leading-relaxed"
        >
          {h.arabic_text.length > 240 && !expanded
            ? h.arabic_text.slice(0, 240) + "…"
            : h.arabic_text}
        </p>
      ) : null}

      {h.narrator ? (
        <div className="mt-2 text-[11px] text-zinc-500">
          Narrated by {h.narrator}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        {h.sunnah_com_url ? (
          <a
            href={h.sunnah_com_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
          >
            <ExternalLink className="h-3 w-3" />
            sunnah.com
          </a>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onAttach}
          disabled={attached || attaching}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
            attached
              ? "bg-[#1B5E20]/30 text-[#4CAF50] border border-[#1B5E20]/40 cursor-default"
              : "bg-[#1B5E20] hover:bg-[#154d19] text-white disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          {attaching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : attached ? (
            "✓ Attached"
          ) : (
            "Attach"
          )}
        </button>
      </div>
    </li>
  );
}
