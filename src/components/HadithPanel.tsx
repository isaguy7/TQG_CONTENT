"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type HadithRecord = {
  id: string;
  reference_text: string;
  sunnah_com_url: string | null;
  narrator: string | null;
  arabic_text: string | null;
  translation_en: string | null;
  grade: string | null;
  verified: boolean;
  verification_notes: string | null;
  created_at: string;
  verified_at: string | null;
};

type SearchResult = {
  reference: string;
  url: string;
  collection?: string;
  snippet?: string;
};

export function HadithPanel({
  onAdded,
}: {
  onAdded?: (hadith: HadithRecord) => void;
}) {
  const [tab, setTab] = useState<"search" | "url">("search");

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="flex border-b border-white/[0.06]">
        <TabButton active={tab === "search"} onClick={() => setTab("search")}>
          Search sunnah.com
        </TabButton>
        <TabButton active={tab === "url"} onClick={() => setTab("url")}>
          Paste URL
        </TabButton>
      </div>
      <div className="p-4">
        {tab === "search" ? (
          <SearchSunnah onAdded={onAdded} />
        ) : (
          <AddByUrl onAdded={onAdded} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-[12px] transition-colors",
        active
          ? "text-white/90 border-b-2 border-primary-hover -mb-px"
          : "text-white/50 hover:text-white/80"
      )}
    >
      {children}
    </button>
  );
}

function SearchSunnah({
  onAdded,
}: {
  onAdded?: (hadith: HadithRecord) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/hadith/search?q=${encodeURIComponent(query.trim())}`
      );
      const json = (await res.json()) as { results: SearchResult[] };
      setResults(json.results);
      if (json.results.length === 0) {
        setMessage(
          "No results. Try different keywords, or paste the sunnah.com URL directly on the other tab."
        );
      }
    } catch {
      setMessage("Search failed. Paste the URL directly instead.");
    } finally {
      setBusy(false);
    }
  };

  const addResult = async (r: SearchResult) => {
    try {
      const res = await fetch("/api/hadith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: r.url, reference_text: r.reference }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(err.error || `HTTP ${res.status}`);
        return;
      }
      const { hadith } = (await res.json()) as { hadith: HadithRecord };
      onAdded?.(hadith);
      setMessage(`Added '${hadith.reference_text}'. Still unverified — click Verify below.`);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div>
      <form onSubmit={doSearch} className="flex gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keywords, narrator, or partial text"
          className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 placeholder-white/25 focus:outline-none focus:border-primary-hover/50"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? "Searching..." : "Search"}
        </button>
      </form>

      {results.length > 0 ? (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li
              key={r.url}
              className="flex items-center gap-2 p-2 rounded hover:bg-white/[0.03]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-white/85 truncate">
                  {r.reference}
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-white/40 hover:text-white/70 truncate block underline underline-offset-2"
                >
                  {r.url}
                </a>
              </div>
              <button
                onClick={() => addResult(r)}
                className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {message ? (
        <div className="mt-3 text-[11px] text-white/50">{message}</div>
      ) : null}

      <div className="mt-4 text-[10px] text-white/30 leading-relaxed">
        Best-effort scrape of sunnah.com. If results look wrong, paste the URL
        directly on the other tab. The app NEVER generates hadith numbers.
      </div>
    </div>
  );
}

function AddByUrl({
  onAdded,
}: {
  onAdded?: (hadith: HadithRecord) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      // First check the URL resolves + get metadata
      const check = await fetch("/api/hadith/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const checkJson = (await check.json()) as {
        ok: boolean;
        canonical?: string;
        enriched?: {
          reference: string;
          narrator?: string;
          arabic?: string;
          translation?: string;
        };
        error?: string;
      };
      if (!check.ok || !checkJson.ok) {
        setMessage(checkJson.error || `HTTP ${check.status}`);
        setBusy(false);
        return;
      }

      const res = await fetch("/api/hadith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: checkJson.canonical || url.trim(),
          reference_text: checkJson.enriched?.reference,
          narrator: checkJson.enriched?.narrator,
          arabic_text: checkJson.enriched?.arabic,
          translation_en: checkJson.enriched?.translation,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(err.error || `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      const { hadith } = (await res.json()) as { hadith: HadithRecord };
      onAdded?.(hadith);
      setUrl("");
      setMessage(`Added '${hadith.reference_text}'. Still unverified.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={add}>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://sunnah.com/bukhari:3744"
          className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 placeholder-white/25 focus:outline-none focus:border-primary-hover/50 font-mono"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? "Checking..." : "Add"}
        </button>
      </div>
      {message ? (
        <div className="mt-3 text-[11px] text-white/50">{message}</div>
      ) : null}
      <div className="mt-4 text-[10px] text-white/30 leading-relaxed">
        Only sunnah.com URLs are accepted. The URL is resolved live; metadata
        is extracted when possible. Reference stays{" "}
        <span className="text-warning font-medium">UNVERIFIED</span> until you
        manually toggle it in the list.
      </div>
    </form>
  );
}

export function HadithList({
  hadith,
  onToggleVerified,
  onDelete,
  onSaveNotes,
}: {
  hadith: HadithRecord[];
  onToggleVerified: (h: HadithRecord) => void;
  onDelete: (h: HadithRecord) => void;
  onSaveNotes?: (h: HadithRecord, notes: string) => void;
}) {
  if (hadith.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[13px] text-white/40">
        No hadith references yet. Add one above.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {hadith.map((h) => (
        <HadithRow
          key={h.id}
          h={h}
          onToggleVerified={() => onToggleVerified(h)}
          onDelete={() => onDelete(h)}
          onSaveNotes={onSaveNotes ? (n) => onSaveNotes(h, n) : undefined}
        />
      ))}
    </ul>
  );
}

function HadithRow({
  h,
  onToggleVerified,
  onDelete,
  onSaveNotes,
}: {
  h: HadithRecord;
  onToggleVerified: () => void;
  onDelete: () => void;
  onSaveNotes?: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(h.verification_notes || "");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setNotes(h.verification_notes || "");
  }, [h.verification_notes]);

  return (
    <li
      className={cn(
        "rounded-lg border p-3 transition-colors",
        h.verified
          ? "bg-emerald-500/[0.04] border-emerald-500/30"
          : "bg-danger/[0.04] border-danger/30"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium",
            h.verified
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-danger/15 text-danger"
          )}
        >
          {h.verified ? "Verified" : "Unverified"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-white/90 truncate">
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
          {h.narrator ? (
            <div className="text-[11px] text-white/50 mt-1">
              Narrated: {h.narrator}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.04]"
          >
            {expanded ? "Hide" : "Notes"}
          </button>
          <button
            onClick={onToggleVerified}
            className={cn(
              "px-2 py-1 rounded text-[11px] font-medium",
              h.verified
                ? "bg-white/[0.04] text-white/70 hover:text-white"
                : "bg-emerald-500/80 text-white hover:bg-emerald-500"
            )}
          >
            {h.verified ? "Unverify" : "Verify"}
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/50 hover:text-danger hover:border-danger/40"
          >
            Delete
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          {h.translation_en ? (
            <div className="mb-2 text-[12px] text-white/70 leading-relaxed">
              {h.translation_en}
            </div>
          ) : null}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (onSaveNotes && notes !== (h.verification_notes || "")) {
                onSaveNotes(notes);
              }
            }}
            placeholder="Verification notes — e.g. 'Confirmed via Mufti Ebrahim Desai on askimam.org'"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white/85 placeholder-white/25 focus:outline-none focus:border-primary-hover/50 min-h-[60px] resize-y"
          />
          <div className="text-[10px] text-white/30 mt-1.5">
            Notes save on blur.
          </div>
        </div>
      ) : null}
    </li>
  );
}
