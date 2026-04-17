"use client";

import { useEffect, useRef, useState } from "react";

type UnsplashResult = {
  id: string;
  alt: string;
  urls: { regular: string; small: string; thumb: string };
  link: string;
  photographer: string;
  photographer_url: string;
};

type SearchResp = {
  available: boolean;
  results?: UnsplashResult[];
  error?: string;
};

export function ImagePicker({
  imageUrl,
  imageRationale,
  onChange,
}: {
  imageUrl: string | null;
  imageRationale: string | null;
  onChange: (url: string | null, rationale: string | null) => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnsplashResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/images/search?q=")
      .then((r) => r.json())
      .then((j: SearchResp) => {
        if (!cancel) setAvailable(Boolean(j.available));
      })
      .catch(() => {
        if (!cancel) setAvailable(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/images/search?q=${encodeURIComponent(query)}&per_page=12`
        );
        const j: SearchResp = await r.json();
        if (!j.available) {
          setError("UNSPLASH_ACCESS_KEY missing");
          setResults([]);
          return;
        }
        if (j.error) {
          setError(j.error);
          setResults([]);
          return;
        }
        setResults(j.results || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  if (available === null || available === false) return null;

  const select = (p: UnsplashResult) => {
    const rationale = `Photo by ${p.photographer} on Unsplash (${p.photographer_url})`;
    onChange(p.urls.regular, rationale);
    setOpen(false);
  };

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Image</span>
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <button
              onClick={() => onChange(null, null)}
              className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-danger hover:border-danger/40"
            >
              Remove
            </button>
          ) : null}
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.04]"
          >
            {open ? "Close" : "Search images"}
          </button>
        </div>
      </div>

      {imageUrl ? (
        <div className="flex items-start gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={imageRationale || "post image"}
            className="w-24 h-24 object-cover rounded border border-white/[0.06]"
          />
          <div className="text-[11px] text-white/60 leading-relaxed">
            {imageRationale || "No attribution noted."}
          </div>
        </div>
      ) : null}

      {open ? (
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Unsplash (e.g. desert, mosque at night)"
            className="w-full bg-transparent border border-white/[0.08] rounded px-3 py-2 text-[13px] text-white/85 placeholder-white/30 focus:outline-none focus:border-white/[0.15]"
            autoFocus
          />
          {error ? (
            <div className="mt-2 text-[12px] text-danger">{error}</div>
          ) : null}
          {loading ? (
            <div className="mt-2 text-[12px] text-white/40">Searching…</div>
          ) : null}
          {results.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => select(p)}
                  className="group relative rounded overflow-hidden border border-white/[0.06] hover:border-white/[0.2]"
                  title={`${p.alt} — ${p.photographer}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.urls.small}
                    alt={p.alt}
                    className="w-full h-24 object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/60 text-[10px] text-white/75 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.photographer}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
