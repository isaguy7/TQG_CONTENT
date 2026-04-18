"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AyahTools } from "@/components/AyahTools";
import { useSurahs } from "@/components/SurahPicker";

type CorpusRow = {
  id: string;
  collection: string;
  collection_name: string;
  hadith_number: number;
  narrator: string | null;
  english_text: string;
  arabic_text: string;
  grade: string | null;
  sunnah_com_url: string | null;
};

type FigureHadithRef = {
  figure_id: string;
  hadith_corpus_id: string;
  relevance_note: string | null;
  created_at: string;
  hadith: CorpusRow | null;
};

type QuranAyah = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
};

type FigureQuranRef = {
  figure_id: string;
  verse_key: string;
  surah: number;
  ayah: number;
  relevance_note: string | null;
  tafseer_note: string | null;
  created_at: string;
  ayah_data: QuranAyah | null;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function FigureQuranSection({
  figureId,
  figureName,
  quranImported,
}: {
  figureId: string;
  figureName: string;
  quranImported: boolean;
}) {
  const [refs, setRefs] = useState<FigureQuranRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [verseInput, setVerseInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [searchResults, setSearchResults] = useState<QuranAyah[]>([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const debouncedKeyword = useDebounced(keywordInput, 350);
  const surahs = useSurahs();
  const surahByNum = useMemo(
    () => new Map(surahs.map((s) => [s.surah, s])),
    [surahs]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/figures/${figureId}/quran`);
      const json = await res.json();
      setRefs(json.items || []);
    } finally {
      setLoading(false);
    }
  }, [figureId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!quranImported) return;
    const q = debouncedKeyword.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/quran/search?q=${encodeURIComponent(q)}&limit=10`)
      .then((r) => r.json())
      .then((j) => setSearchResults(j.results || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [debouncedKeyword, quranImported]);

  const addByKey = async () => {
    setAddError(null);
    const verseKey = verseInput.trim();
    if (!verseKey) return;
    const res = await fetch(`/api/figures/${figureId}/quran`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verse_key: verseKey }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setAddError(j.error || "Failed to add");
      return;
    }
    setVerseInput("");
    await load();
  };

  const addFromSearch = async (ayah: QuranAyah) => {
    setAddError(null);
    const res = await fetch(`/api/figures/${figureId}/quran`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verse_key: ayah.verse_key }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setAddError(j.error || "Failed to add");
      return;
    }
    setKeywordInput("");
    setSearchResults([]);
    await load();
  };

  const updateNote = async (
    verseKey: string,
    field: "relevance_note" | "tafseer_note",
    value: string
  ) => {
    await fetch(
      `/api/figures/${figureId}/quran/${encodeURIComponent(verseKey)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      }
    );
    setRefs((prev) =>
      prev.map((r) =>
        r.verse_key === verseKey ? { ...r, [field]: value } : r
      )
    );
  };

  const removeRef = async (verseKey: string) => {
    if (!confirm(`Remove ayah ${verseKey}?`)) return;
    await fetch(
      `/api/figures/${figureId}/quran/${encodeURIComponent(verseKey)}`,
      { method: "DELETE" }
    );
    await load();
  };

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">
          Linked Quran ayahs ({refs.length})
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
        >
          {adding ? "Cancel" : "+ Add ayah"}
        </button>
      </div>

      {adding ? (
        <div className="mb-4 p-3 rounded border border-white/[0.06] bg-white/[0.02] space-y-3">
          {!quranImported ? (
            <div className="rounded bg-amber-500/10 border border-amber-400/30 text-amber-100 text-[12px] p-2 leading-relaxed">
              Import Quran data first:{" "}
              <code className="font-mono text-[11px] bg-black/30 px-1 rounded">
                node scripts/import-quran.mjs
              </code>
            </div>
          ) : null}
          <div>
            <label className="block text-[11px] text-white/50 mb-1">
              By verse key (e.g. 9:40)
            </label>
            <div className="flex gap-2">
              <input
                value={verseInput}
                onChange={(e) => setVerseInput(e.target.value)}
                placeholder="9:40"
                className="flex-1 bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[13px] text-white/85"
              />
              <button
                onClick={addByKey}
                disabled={!verseInput.trim()}
                className="px-3 py-1 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-white/50 mb-1">
              By English keywords
            </label>
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={`Try "${figureName}" or a theme…`}
              className="w-full bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[13px] text-white/85"
            />
            {searching ? (
              <div className="mt-2 text-[11px] text-white/40">Searching…</div>
            ) : null}
            {searchResults.length > 0 ? (
              <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                {searchResults.map((a) => (
                  <li
                    key={a.verse_key}
                    className="p-2 rounded border border-white/[0.06] bg-white/[0.02]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-primary-bright">
                        {a.verse_key}
                      </span>
                      <button
                        onClick={() => addFromSearch(a)}
                        className="px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
                      >
                        + Link
                      </button>
                    </div>
                    <div
                      dir="rtl"
                      className="text-[13px] text-white/85 leading-relaxed"
                    >
                      {a.text_uthmani}
                    </div>
                    {a.translation_en ? (
                      <div className="text-[11px] text-white/50 mt-1">
                        {a.translation_en}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {addError ? (
            <div className="text-[12px] text-danger">{addError}</div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[12px] text-white/40">Loading…</div>
      ) : refs.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No Quran refs linked yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {refs.map((r) => (
            <li
              key={r.verse_key}
              className="p-3 rounded border border-white/[0.06] bg-white/[0.02]"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-primary-bright">
                    {r.verse_key}
                  </span>
                  {surahByNum.get(r.surah) ? (
                    <span className="ml-2 text-[11px] text-white/55">
                      {surahByNum.get(r.surah)!.name_transliteration} ·{" "}
                      {surahByNum.get(r.surah)!.name_english}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={() => removeRef(r.verse_key)}
                  className="text-[11px] text-white/40 hover:text-danger"
                >
                  Remove
                </button>
              </div>
              {r.ayah_data ? (
                <>
                  <div
                    dir="rtl"
                    className="text-[14px] text-white/90 leading-relaxed mb-1"
                  >
                    {r.ayah_data.text_uthmani}
                  </div>
                  {r.ayah_data.translation_en ? (
                    <div className="text-[12px] text-white/60 leading-relaxed mb-2">
                      {r.ayah_data.translation_en}
                    </div>
                  ) : null}
                  <AyahTools surah={r.surah} ayah={r.ayah} />
                </>
              ) : (
                <div className="text-[11px] text-white/40">
                  Quran data not imported — only the verse key is stored.
                </div>
              )}
              <div className="mt-3 space-y-2">
                <NoteField
                  label="Relevance"
                  value={r.relevance_note || ""}
                  onSave={(v) => updateNote(r.verse_key, "relevance_note", v)}
                  placeholder="Why this ayah connects to the figure…"
                />
                <NoteField
                  label="Tafseer"
                  value={r.tafseer_note || ""}
                  onSave={(v) => updateNote(r.verse_key, "tafseer_note", v)}
                  placeholder="Tafseer / scholarly context…"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FigureHadithSection({
  figureId,
  figureName,
}: {
  figureId: string;
  figureName: string;
}) {
  const [refs, setRefs] = useState<FigureHadithRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CorpusRow[]>([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounced(query, 350);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/figures/${figureId}/hadith`);
      const json = await res.json();
      setRefs(json.items || []);
    } finally {
      setLoading(false);
    }
  }, [figureId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!adding) return;
    const q = debounced.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/hadith-corpus/search?q=${encodeURIComponent(q)}&limit=15`)
      .then((r) => r.json())
      .then((j) => setResults(j.results || []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [debounced, adding]);

  const attachedIds = useMemo(
    () => new Set(refs.map((r) => r.hadith_corpus_id)),
    [refs]
  );

  const addHadith = async (row: CorpusRow) => {
    await fetch(`/api/figures/${figureId}/hadith`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hadith_corpus_id: row.id }),
    });
    await load();
  };

  const updateNote = async (hadithId: string, value: string) => {
    await fetch(`/api/figures/${figureId}/hadith/${hadithId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relevance_note: value }),
    });
    setRefs((prev) =>
      prev.map((r) =>
        r.hadith_corpus_id === hadithId ? { ...r, relevance_note: value } : r
      )
    );
  };

  const removeRef = async (hadithId: string) => {
    if (!confirm("Remove this hadith link?")) return;
    await fetch(`/api/figures/${figureId}/hadith/${hadithId}`, {
      method: "DELETE",
    });
    await load();
  };

  const openAdd = () => {
    setAdding(true);
    if (!query) setQuery(figureName);
  };

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Linked hadith ({refs.length})</span>
        <button
          onClick={() => (adding ? setAdding(false) : openAdd())}
          className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
        >
          {adding ? "Cancel" : "+ Add hadith"}
        </button>
      </div>

      {adding ? (
        <div className="mb-4 p-3 rounded border border-white/[0.06] bg-white/[0.02] space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hadith by English text…"
            className="w-full bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[13px] text-white/85"
          />
          {searching ? (
            <div className="text-[11px] text-white/40">Searching…</div>
          ) : null}
          {results.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto space-y-1">
              {results.map((h) => {
                const already = attachedIds.has(h.id);
                return (
                  <li
                    key={h.id}
                    className="p-2 rounded border border-white/[0.06] bg-white/[0.02]"
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-primary-bright truncate">
                        {h.collection_name} #{h.hadith_number}
                      </span>
                      {already ? (
                        <span className="text-[10px] text-emerald-300">
                          linked
                        </span>
                      ) : (
                        <button
                          onClick={() => addHadith(h)}
                          className="px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
                        >
                          + Link
                        </button>
                      )}
                    </div>
                    <div className="text-[12px] text-white/70 leading-relaxed line-clamp-3">
                      {h.english_text}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : debounced.trim() && !searching ? (
            <div className="text-[11px] text-white/40">No matches.</div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[12px] text-white/40">Loading…</div>
      ) : refs.length === 0 ? (
        <div className="text-[12px] text-white/40">No hadith linked yet.</div>
      ) : (
        <ul className="space-y-3">
          {refs.map((r) => (
            <li
              key={r.hadith_corpus_id}
              className="p-3 rounded border border-white/[0.06] bg-white/[0.02]"
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] uppercase tracking-wider text-primary-bright">
                    {r.hadith?.collection_name || r.hadith?.collection}
                    {r.hadith ? ` #${r.hadith.hadith_number}` : ""}
                  </span>
                  {r.hadith?.narrator ? (
                    <div className="text-[10px] text-white/45">
                      {r.hadith.narrator}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {r.hadith?.sunnah_com_url ? (
                    <a
                      href={r.hadith.sunnah_com_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-white/50 hover:text-white/85 underline underline-offset-2"
                    >
                      sunnah.com
                    </a>
                  ) : null}
                  <button
                    onClick={() => removeRef(r.hadith_corpus_id)}
                    className="text-[11px] text-white/40 hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {r.hadith?.english_text ? (
                <div className="text-[12px] text-white/75 leading-relaxed line-clamp-4">
                  {r.hadith.english_text}
                </div>
              ) : null}
              <div className="mt-3">
                <NoteField
                  label="Relevance"
                  value={r.relevance_note || ""}
                  onSave={(v) => updateNote(r.hadith_corpus_id, v)}
                  placeholder="Why this hadith connects to the figure…"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteField({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
        {label}
      </label>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onSave(local);
        }}
        placeholder={placeholder}
        className={cn(
          "w-full bg-transparent border border-white/[0.06] rounded px-2 py-1 text-[12px] text-white/80 focus:outline-none focus:border-white/[0.2] min-h-[36px] leading-relaxed"
        )}
      />
    </div>
  );
}
