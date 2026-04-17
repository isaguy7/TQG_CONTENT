"use client";

import { useEffect, useState } from "react";
import { Plus, X, BookOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Ayah = {
  surah: number;
  ayah: number;
  verse_key: string;
  text_uthmani: string;
  translation_en: string | null;
};

export type QuranRef = {
  surah: number;
  ayah: number;
  verse_key: string;
  text_uthmani?: string;
  translation_en?: string | null;
  tafseer_note?: string;
};

type Props = {
  postId: string;
  refs: QuranRef[];
  onRefsChange: (refs: QuranRef[]) => void;
};

const VERSE_KEY_RE = /^\s*(\d{1,3})\s*[:\-\s]\s*(\d{1,3})\s*$/;

export function QuranPanel({ postId, refs, onRefsChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Ayah[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);

    const direct = q.match(VERSE_KEY_RE);
    try {
      if (direct) {
        const surah = Number(direct[1]);
        const ayah = Number(direct[2]);
        const res = await fetch(`/api/quran/${surah}/${ayah}`);
        if (!res.ok) {
          setError(`No ayah ${surah}:${ayah}`);
          setResults([]);
        } else {
          const { ayah: row } = (await res.json()) as { ayah: Ayah };
          setResults([row]);
        }
      } else {
        const res = await fetch(
          `/api/quran/search?q=${encodeURIComponent(q)}&limit=12`
        );
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setResults([]);
        } else {
          const { results } = (await res.json()) as { results: Ayah[] };
          setResults(results || []);
          if (!results || results.length === 0) {
            setError("No ayahs match that search.");
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const attach = async (a: Ayah) => {
    setAdding(a.verse_key);
    try {
      const res = await fetch(`/api/posts/${postId}/quran`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: {
            surah: a.surah,
            ayah: a.ayah,
            text_uthmani: a.text_uthmani,
            translation_en: a.translation_en,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { refs } = (await res.json()) as { refs: QuranRef[] };
      onRefsChange(refs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(null);
    }
  };

  const detach = async (verseKey: string) => {
    try {
      const res = await fetch(
        `/api/posts/${postId}/quran?verse_key=${encodeURIComponent(verseKey)}`,
        { method: "DELETE" }
      );
      if (!res.ok) return;
      const { refs } = (await res.json()) as { refs: QuranRef[] };
      onRefsChange(refs);
    } catch {
      // silent
    }
  };

  const saveNote = async (verseKey: string, note: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/quran`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verse_key: verseKey, tafseer_note: note }),
      });
      if (!res.ok) return;
      const { refs } = (await res.json()) as { refs: QuranRef[] };
      onRefsChange(refs);
    } catch {
      // silent
    }
  };

  const attachedKeys = new Set(refs.map((r) => r.verse_key));

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-primary-bright" />
          <span className="section-label">
            Quran references ({refs.length})
          </span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
        >
          {open ? "Hide search" : "Search Quran"}
        </button>
      </div>

      {open ? (
        <div className="mb-4 rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
          <form onSubmit={search} className="flex gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="English keywords, or '2:255'"
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 placeholder-white/25 focus:outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={busy || !query.trim()}
              className="px-3 py-2 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {busy ? "Searching…" : "Search"}
            </button>
          </form>
          {error ? (
            <div className="text-[11px] text-white/50 mb-2">{error}</div>
          ) : null}
          {results.length > 0 ? (
            <ul className="space-y-1.5">
              {results.map((r) => {
                const already = attachedKeys.has(r.verse_key);
                return (
                  <li
                    key={r.verse_key}
                    className="p-2.5 rounded border border-white/[0.05] bg-white/[0.02]"
                  >
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium font-mono bg-primary/15 text-primary-bright">
                        {r.verse_key}
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => attach(r)}
                        disabled={already || adding === r.verse_key}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                        {already
                          ? "Attached"
                          : adding === r.verse_key
                          ? "Adding…"
                          : "Attach"}
                      </button>
                    </div>
                    {r.text_uthmani ? (
                      <div className="mt-2 text-[15px] text-white/90 font-arabic text-right leading-relaxed">
                        {r.text_uthmani}
                      </div>
                    ) : null}
                    {r.translation_en ? (
                      <div className="mt-1 text-[12px] text-white/75 leading-relaxed">
                        {r.translation_en}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {refs.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No ayahs attached. Search above to add one.
        </div>
      ) : (
        <ul className="space-y-2">
          {refs.map((r) => (
            <QuranRefRow
              key={r.verse_key}
              refItem={r}
              onDetach={() => detach(r.verse_key)}
              onSaveNote={(n) => saveNote(r.verse_key, n)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuranRefRow({
  refItem,
  onDetach,
  onSaveNote,
}: {
  refItem: QuranRef;
  onDetach: () => void;
  onSaveNote: (note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(refItem.tafseer_note || "");

  useEffect(() => {
    setNote(refItem.tafseer_note || "");
  }, [refItem.tafseer_note]);

  return (
    <li className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-start gap-2">
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium font-mono bg-primary/15 text-primary-bright">
          {refItem.verse_key}
        </span>
        <div className="flex-1 min-w-0">
          {refItem.text_uthmani ? (
            <div className="text-[15px] text-white/90 font-arabic text-right leading-relaxed truncate">
              {refItem.text_uthmani}
            </div>
          ) : null}
          {refItem.translation_en ? (
            <div className="text-[12px] text-white/75 leading-relaxed mt-1 truncate">
              {refItem.translation_en}
            </div>
          ) : null}
          {refItem.tafseer_note ? (
            <div className="text-[11px] text-primary-bright/85 mt-1 italic truncate">
              Tafseer: {refItem.tafseer_note}
            </div>
          ) : null}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center p-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.04]"
            title={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </button>
          <button
            onClick={onDetach}
            className="inline-flex items-center p-1 rounded text-[11px] border border-white/[0.08] text-white/50 hover:text-danger hover:border-danger/40"
            title="Detach"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          {refItem.text_uthmani ? (
            <div className="text-[16px] text-white/95 font-arabic text-right leading-relaxed mb-2">
              {refItem.text_uthmani}
            </div>
          ) : null}
          {refItem.translation_en ? (
            <div className="text-[12px] text-white/80 leading-relaxed mb-3">
              {refItem.translation_en}
            </div>
          ) : null}
          <label className="text-[11px] text-white/55 mb-1 block">
            Tafseer / context note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== (refItem.tafseer_note || "")) {
                onSaveNote(note);
              }
            }}
            placeholder="Paste tafseer excerpt, asbab al-nuzul, or your own context notes. Saves on blur."
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white/85 placeholder-white/25 focus:outline-none focus:border-primary/50 min-h-[60px] resize-y"
          />
        </div>
      ) : null}
    </li>
  );
}
