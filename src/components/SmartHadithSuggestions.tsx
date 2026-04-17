"use client";

import { useEffect, useState } from "react";
import { Sparkles, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Suggestion = {
  id: string;
  collection: string;
  collection_name: string;
  hadith_number: number;
  english_text: string;
  narrator: string | null;
  grade: string | null;
  sunnah_com_url: string | null;
  in_book_reference: string | null;
};

type Props = {
  content: string;
  postId: string;
  attachedHadithIds: Set<string>;
  onAttached: () => void;
};

export function SmartHadithSuggestions({
  content,
  postId,
  attachedHadithIds,
  onAttached,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (content.trim().length < 30) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch("/api/hadith-corpus/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, limit: 5 }),
      })
        .then((r) => r.json())
        .then((j) => {
          setSuggestions(j.suggestions || []);
          setKeywords(j.keywords || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 2000);
    return () => clearTimeout(timer);
  }, [content]);

  const attach = async (s: Suggestion) => {
    setAdding(s.id);
    try {
      const hadithRes = await fetch("/api/hadith", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: s.sunnah_com_url,
          reference_text:
            s.in_book_reference || `${s.collection_name} ${s.hadith_number}`,
          narrator: s.narrator,
          translation_en: s.english_text,
          grade: s.grade,
        }),
      });
      if (!hadithRes.ok) throw new Error(`HTTP ${hadithRes.status}`);
      const { hadith } = (await hadithRes.json()) as { hadith: { id: string } };
      await fetch(`/api/posts/${postId}/hadith`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hadith_id: hadith.id }),
      });
      onAttached();
      setDismissed((d) => {
        const next = new Set(d);
        next.add(s.id);
        return next;
      });
    } catch {
      // ignore; user can use Search corpus fallback
    } finally {
      setAdding(null);
    }
  };

  const visible = suggestions.filter(
    (s) =>
      !dismissed.has(s.id) &&
      !(s.sunnah_com_url && attachedHadithIds.has(s.id))
  );

  if (content.trim().length < 30) return null;
  if (!loading && visible.length === 0) return null;

  return (
    <section className="rounded-lg bg-primary/[0.06] border border-primary/25 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary-bright" />
          <span className="section-label text-primary-bright">
            Hadith suggestions
          </span>
          {keywords.length > 0 ? (
            <span className="text-[10px] text-white/40 ml-2">
              from: {keywords.slice(0, 4).join(", ")}
            </span>
          ) : null}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-[11px] text-white/45 hover:text-white/80"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {collapsed ? null : loading && visible.length === 0 ? (
        <div className="text-[12px] text-white/45">Scanning corpus…</div>
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => {
            const snippet =
              s.english_text.length > 200
                ? s.english_text.slice(0, 197) + "…"
                : s.english_text;
            return (
              <li
                key={s.id}
                className="rounded-md border border-white/[0.06] bg-white/[0.03] p-3"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-white/[0.06] text-white/75">
                    {s.collection}
                  </span>
                  <span className="shrink-0 text-[11px] text-white/50 tabular-nums">
                    #{s.hadith_number}
                  </span>
                  {s.grade ? (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-300">
                      {s.grade}
                    </span>
                  ) : null}
                  <div className="flex-1" />
                  <button
                    onClick={() => attach(s)}
                    disabled={adding === s.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                    {adding === s.id ? "Adding…" : "Attach"}
                  </button>
                  <button
                    onClick={() =>
                      setDismissed((d) => {
                        const next = new Set(d);
                        next.add(s.id);
                        return next;
                      })
                    }
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/[0.06]"
                    title="Not relevant"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {s.narrator ? (
                  <div className="text-[11px] text-white/55 mb-1">
                    Narrated: {s.narrator}
                  </div>
                ) : null}
                <div className="text-[12px] text-white/80 leading-relaxed">
                  {snippet}
                </div>
                {s.sunnah_com_url ? (
                  <a
                    href={s.sunnah_com_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "mt-1.5 inline-block text-[11px] text-white/40 hover:text-primary-bright underline underline-offset-2 truncate"
                    )}
                  >
                    {s.sunnah_com_url}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
