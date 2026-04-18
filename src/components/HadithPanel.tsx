"use client";

import { useState } from "react";
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

export type CorpusRow = {
  id: string;
  collection: string;
  collection_name: string;
  hadith_number: number;
  chapter_title_en: string | null;
  arabic_text: string;
  english_text: string;
  narrator: string | null;
  grade: string | null;
  sunnah_com_url: string | null;
  in_book_reference: string | null;
};

export const CORPUS_COLLECTIONS: Array<{ slug: string; label: string }> = [
  { slug: "", label: "All collections" },
  { slug: "bukhari", label: "Sahih al-Bukhari" },
  { slug: "muslim", label: "Sahih Muslim" },
  { slug: "abudawud", label: "Abu Dawud" },
  { slug: "tirmidhi", label: "Tirmidhi" },
  { slug: "nasai", label: "Nasa'i" },
  { slug: "ibnmajah", label: "Ibn Majah" },
];

export function HadithPanel({
  onAdded,
}: {
  onAdded?: (hadith: HadithRecord) => void;
}) {
  const [tab, setTab] = useState<"corpus" | "search" | "url">("corpus");

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="flex border-b border-white/[0.06]">
        <TabButton active={tab === "corpus"} onClick={() => setTab("corpus")}>
          Search corpus
        </TabButton>
        <TabButton active={tab === "search"} onClick={() => setTab("search")}>
          Search sunnah.com
        </TabButton>
        <TabButton active={tab === "url"} onClick={() => setTab("url")}>
          Paste URL
        </TabButton>
      </div>
      <div className="p-4">
        {tab === "corpus" ? (
          <SearchCorpus onAdded={onAdded} />
        ) : tab === "search" ? (
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
      setMessage(`Added '${hadith.reference_text}'.`);
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
      setMessage(`Added '${hadith.reference_text}'.`);
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
        is extracted when possible.
      </div>
    </form>
  );
}

export function SearchCorpus({
  onAdded,
}: {
  onAdded?: (hadith: HadithRecord) => void;
}) {
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CorpusRow[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: "20" });
      if (collection) params.set("collection", collection);
      const res = await fetch(`/api/hadith-corpus/search?${params.toString()}`);
      const json = (await res.json()) as {
        results?: CorpusRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const rows = json.results || [];
      setResults(rows);
      setTotal(json.total ?? 0);
      if (rows.length === 0) {
        setMessage("No hadith matched. Try different keywords.");
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addResult = async (row: CorpusRow) => {
    setAdding(row.id);
    setMessage(null);
    try {
      const res = await fetch("/api/hadith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: row.sunnah_com_url,
          reference_text:
            row.in_book_reference ||
            `${row.collection_name} ${row.hadith_number}`,
          narrator: row.narrator,
          arabic_text: row.arabic_text,
          translation_en: row.english_text,
          grade: row.grade,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessage(err.error || `HTTP ${res.status}`);
        return;
      }
      const { hadith } = (await res.json()) as { hadith: HadithRecord };
      onAdded?.(hadith);
      setMessage(`Added '${hadith.reference_text}'.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      <form onSubmit={doSearch} className="flex flex-wrap gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keywords in the English text"
          className="flex-1 min-w-[180px] bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 placeholder-white/25 focus:outline-none focus:border-primary-hover/50"
        />
        <select
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-2 text-[12px] text-white/85"
        >
          {CORPUS_COLLECTIONS.map((c) => (
            <option key={c.slug || "all"} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="px-3 py-2 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? "Searching..." : "Search"}
        </button>
      </form>

      {results.length > 0 ? (
        <>
          <div className="text-[10px] text-white/40 mb-2">
            {results.length} shown of {total} match{total === 1 ? "" : "es"}
          </div>
          <ul className="space-y-1.5">
            {results.map((r) => {
              const snippet =
                r.english_text.length > 220
                  ? r.english_text.slice(0, 217) + "…"
                  : r.english_text;
              return (
                <li
                  key={r.id}
                  className="p-2.5 rounded border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.03]"
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-white/[0.05] text-white/70">
                      {r.collection}
                    </span>
                    <span className="shrink-0 text-[11px] text-white/50 tabular-nums">
                      #{r.hadith_number}
                    </span>
                    {r.grade ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-300">
                        {r.grade}
                      </span>
                    ) : null}
                    <div className="flex-1" />
                    <button
                      onClick={() => addResult(r)}
                      disabled={adding === r.id}
                      title={
                        r.sunnah_com_url
                          ? undefined
                          : "No sunnah.com URL available — will be added as reference-only"
                      }
                      className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      {adding === r.id
                        ? "Adding…"
                        : r.sunnah_com_url
                        ? "Add"
                        : "Add (no URL)"}
                    </button>
                  </div>
                  {r.narrator ? (
                    <div className="mt-1.5 text-[11px] text-white/60">
                      Narrated: {r.narrator}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[12px] text-white/85 leading-relaxed">
                    {snippet}
                  </div>
                  {r.sunnah_com_url ? (
                    <a
                      href={r.sunnah_com_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-[11px] text-white/40 hover:text-white/70 underline underline-offset-2"
                    >
                      {r.sunnah_com_url}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {message ? (
        <div className="mt-3 text-[11px] text-white/50">{message}</div>
      ) : null}

      <div className="mt-4 text-[10px] text-white/30 leading-relaxed">
        Local corpus of ~34k hadith. Every reference links to sunnah.com for
        cross-checking.
      </div>
    </div>
  );
}

export function HadithList({
  hadith,
  onDelete,
}: {
  hadith: HadithRecord[];
  onDelete: (h: HadithRecord) => void;
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
        <HadithRow key={h.id} h={h} onDelete={() => onDelete(h)} />
      ))}
    </ul>
  );
}

function HadithRow({
  h,
  onDelete,
}: {
  h: HadithRecord;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition-colors">
      <div className="flex items-start gap-3">
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
          {h.translation_en ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.04]"
            >
              {expanded ? "Hide" : "Read"}
            </button>
          ) : null}
          <button
            onClick={onDelete}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/50 hover:text-danger hover:border-danger/40"
          >
            Delete
          </button>
        </div>
      </div>
      {expanded && h.translation_en ? (
        <div className="mt-3 pt-3 border-t border-white/[0.05] text-[12px] text-white/70 leading-relaxed">
          {h.translation_en}
        </div>
      ) : null}
    </li>
  );
}
