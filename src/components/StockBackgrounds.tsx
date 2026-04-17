"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type StockVideo = {
  id: number;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
  preview_url: string;
  download_url: string;
  credit: { user: string; user_url: string; source_url: string };
};

type QuickPick = {
  category: string;
  query: string;
  videos: StockVideo[];
};

type Props = {
  /** Optional English translation used to auto-suggest a theme query. */
  seedText?: string;
  orientation: "square" | "portrait" | "landscape";
  /** Called after successful download with the server-side file paths. */
  onDownloaded: (paths: string[]) => void;
};

export function StockBackgrounds({
  seedText,
  orientation,
  onDownloaded,
}: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [quickPick, setQuickPick] = useState<QuickPick[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockVideo[]>([]);
  const [matchedThemes, setMatchedThemes] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Load quick-pick thumbnails once — cheap, cached 24h server-side.
  useEffect(() => {
    fetch(`/api/clips/stock-videos?mode=quick_pick&orientation=${orientation}`)
      .then((r) => r.json())
      .then((j) => {
        setAvailable(!!j.available);
        setReason(j.reason || null);
        setQuickPick(j.quick_pick || []);
      })
      .catch(() => {
        setAvailable(false);
        setReason("Failed to reach stock-videos API.");
      });
  }, [orientation]);

  // When seedText changes (user identified a new ayah), auto-run a
  // theme-matched search.
  useEffect(() => {
    if (!seedText || !available) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setSearching(true);
        const res = await fetch(
          `/api/clips/stock-videos?match=${encodeURIComponent(seedText)}&orientation=${orientation}`,
          { signal: controller.signal }
        );
        const j = await res.json();
        setResults(j.results || []);
        setMatchedThemes(j.matched_themes || []);
        if (j.query) setQuery(j.query);
      } finally {
        setSearching(false);
      }
    };
    run();
    return () => controller.abort();
  }, [seedText, available, orientation]);

  const runSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/clips/stock-videos?q=${encodeURIComponent(q)}&orientation=${orientation}`
        );
        const j = await res.json();
        setResults(j.results || []);
      } finally {
        setSearching(false);
      }
    },
    [orientation]
  );

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadSelected = async () => {
    const picks = results.filter((r) => selected.has(r.id));
    if (picks.length === 0) return;
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/clips/download-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: picks.map((p) => ({
            id: p.id,
            download_url: p.download_url,
            credit: {
              user: p.credit.user,
              source_url: p.credit.source_url,
            },
          })),
        }),
      });
      const j = await res.json();
      const okPaths = (j.results || [])
        .filter((r: { ok: boolean; path?: string }) => r.ok && r.path)
        .map((r: { path: string }) => r.path);
      onDownloaded(okPaths);
      setMessage(
        `Saved ${okPaths.length} of ${picks.length} to backgrounds/`
      );
      setSelected(new Set());
    } catch (err) {
      setMessage(`Failed: ${(err as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };

  const quickPickFromThumbnail = async (v: StockVideo) => {
    setDownloading(true);
    try {
      const res = await fetch("/api/clips/download-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: [
            {
              id: v.id,
              download_url: v.download_url,
              credit: {
                user: v.credit.user,
                source_url: v.credit.source_url,
              },
            },
          ],
        }),
      });
      const j = await res.json();
      const paths = (j.results || [])
        .filter((r: { ok: boolean; path?: string }) => r.ok && r.path)
        .map((r: { path: string }) => r.path);
      if (paths.length > 0) {
        onDownloaded(paths);
        setMessage(`Saved pexels-${v.id}.mp4`);
      }
    } finally {
      setDownloading(false);
    }
  };

  const flattenedQuick = useMemo(() => {
    return quickPick.flatMap((q) =>
      q.videos.map((v) => ({ ...v, category: q.category }))
    );
  }, [quickPick]);

  if (available === null) {
    return (
      <div className="text-[12px] text-white/40">Loading stock backgrounds…</div>
    );
  }
  if (!available) {
    return (
      <div className="rounded bg-white/[0.02] border border-white/[0.06] p-3 text-[12px] text-white/50 leading-relaxed">
        {reason ||
          "Stock-video search is off. Add PEXELS_API_KEY to .env.local to enable it."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {flattenedQuick.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/45">
              Quick pick
            </span>
            <span className="text-[10px] text-white/35">
              click a thumbnail to download
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {flattenedQuick.slice(0, 5).map((v) => (
              <button
                key={`${v.category}-${v.id}`}
                onClick={() => quickPickFromThumbnail(v)}
                disabled={downloading}
                className="relative aspect-square rounded overflow-hidden border border-white/[0.08] hover:border-primary-bright/60 transition-colors group"
                title={v.category}
              >
                <img
                  src={v.thumbnail}
                  alt={v.category}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0 left-0 right-0 text-[9px] py-0.5 text-white/90 bg-gradient-to-t from-black/80 to-transparent capitalize">
                  {v.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) runSearch(query.trim());
          }}
          placeholder={
            matchedThemes.length > 0
              ? `Matched: ${matchedThemes.join(", ")}`
              : "Search Pexels…"
          }
          className="flex-1 bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85 focus:outline-none focus:border-white/[0.2]"
        />
        <button
          onClick={() => runSearch(query.trim())}
          disabled={!query.trim() || searching}
          className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05] disabled:opacity-40"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {results.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {results.map((v) => {
              const picked = selected.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggleSelect(v.id)}
                  className={cn(
                    "relative aspect-square rounded overflow-hidden border transition-colors",
                    picked
                      ? "border-primary-bright ring-2 ring-primary-bright/30"
                      : "border-white/[0.08] hover:border-white/30"
                  )}
                >
                  <img
                    src={v.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] py-0.5 text-white/90 bg-gradient-to-t from-black/80 to-transparent text-left pl-1">
                    {v.duration}s · {v.width}×{v.height}
                  </span>
                  {picked ? (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 text-center">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-white/35">
              Videos from{" "}
              <a
                href="https://pexels.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-white/60"
              >
                Pexels
              </a>{" "}
              — free with attribution.
            </span>
            <button
              onClick={downloadSelected}
              disabled={selected.size === 0 || downloading}
              className="px-3 py-1 rounded text-[11px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {downloading
                ? "Downloading…"
                : `Download ${selected.size || ""}`}
            </button>
          </div>
        </>
      ) : null}

      {message ? (
        <div className="text-[11px] text-primary-bright">{message}</div>
      ) : null}
    </div>
  );
}
