"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSurahs } from "@/components/SurahPicker";
import { AyahTools } from "@/components/AyahTools";

type FigureDetails = {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: "sahabi" | "prophet" | "scholar" | "tabii";
  era: string | null;
  bio_short: string | null;
  themes: string[] | null;
  hook_angles: unknown;
};

type HookAngle = {
  category?: string;
  text: string;
};

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
  hadith_corpus_id: string;
  relevance_note: string | null;
  hadith: CorpusRow | null;
};

type FigureQuranRef = {
  verse_key: string;
  surah: number;
  ayah: number;
  relevance_note: string | null;
  tafseer_note: string | null;
  ayah_data: {
    verse_key: string;
    surah: number;
    ayah: number;
    text_uthmani: string;
    translation_en: string | null;
  } | null;
};

const PAGE = 15;

type Props = {
  figureId: string;
  postId: string;
  attachedHadithIds: Set<string>;
  onPickHookAngle: (text: string) => void;
  onAttachedHadith: () => void;
  onAttachedAyah?: () => void;
};

export function FigureContextPanel({
  figureId,
  postId,
  attachedHadithIds,
  onPickHookAngle,
  onAttachedHadith,
  onAttachedAyah,
}: Props) {
  const [open, setOpen] = useState(true);
  const [figure, setFigure] = useState<FigureDetails | null>(null);
  const [hadithRefs, setHadithRefs] = useState<FigureHadithRef[]>([]);
  const [quranRefs, setQuranRefs] = useState<FigureQuranRef[]>([]);
  const [attachedQuranKeys, setAttachedQuranKeys] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quranFilter, setQuranFilter] = useState("");
  const [hadithFilter, setHadithFilter] = useState("");
  const [quranPage, setQuranPage] = useState(0);
  const [hadithPage, setHadithPage] = useState(0);
  const surahs = useSurahs();
  const surahByNum = useMemo(
    () => new Map(surahs.map((s) => [s.surah, s])),
    [surahs]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [f, h, q, p] = await Promise.all([
      fetch(`/api/figures/${figureId}`).then((r) => r.json()),
      fetch(`/api/figures/${figureId}/hadith`).then((r) => r.json()),
      fetch(`/api/figures/${figureId}/quran`).then((r) => r.json()),
      fetch(`/api/posts/${postId}`).then((r) => r.json()),
    ]);
    setFigure(f.figure);
    setHadithRefs(h.items || []);
    setQuranRefs(q.items || []);
    const existing = (p.post?.quran_refs || []) as Array<{ verse_key?: string }>;
    setAttachedQuranKeys(
      new Set(existing.map((e) => e.verse_key).filter(Boolean) as string[])
    );
    setLoading(false);
  }, [figureId, postId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setQuranPage(0);
  }, [quranFilter, figureId]);
  useEffect(() => {
    setHadithPage(0);
  }, [hadithFilter, figureId]);

  const hookAngles = useMemo<HookAngle[]>(() => {
    if (!figure) return [];
    const raw = figure.hook_angles;
    if (Array.isArray(raw)) {
      return raw
        .map((r) => {
          if (typeof r === "string") return { text: r };
          if (r && typeof r === "object") {
            const obj = r as Record<string, unknown>;
            const text = (obj.text || obj.hook || obj.line) as string | undefined;
            const category = obj.category as string | undefined;
            if (text) return { text, category };
          }
          return null;
        })
        .filter(Boolean) as HookAngle[];
    }
    return [];
  }, [figure]);

  const filteredQuran = useMemo(() => {
    const q = quranFilter.trim().toLowerCase();
    if (!q) return quranRefs;
    return quranRefs.filter((r) => {
      if (r.verse_key.toLowerCase().includes(q)) return true;
      if (r.ayah_data?.translation_en?.toLowerCase().includes(q)) return true;
      if (r.relevance_note?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [quranRefs, quranFilter]);

  const filteredHadith = useMemo(() => {
    const q = hadithFilter.trim().toLowerCase();
    if (!q) return hadithRefs;
    return hadithRefs.filter((r) => {
      if (!r.hadith) return false;
      if (
        `${r.hadith.collection_name} ${r.hadith.hadith_number}`
          .toLowerCase()
          .includes(q)
      )
        return true;
      if (r.hadith.english_text.toLowerCase().includes(q)) return true;
      if (r.hadith.narrator?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [hadithRefs, hadithFilter]);

  const quranSlice = filteredQuran.slice(
    quranPage * PAGE,
    (quranPage + 1) * PAGE
  );
  const hadithSlice = filteredHadith.slice(
    hadithPage * PAGE,
    (hadithPage + 1) * PAGE
  );

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 1800);
  };

  const attachQuran = async (ref: FigureQuranRef) => {
    if (attachedQuranKeys.has(ref.verse_key)) return;
    const existingRaw = await fetch(`/api/posts/${postId}`)
      .then((r) => r.json())
      .then((j) => (j.post?.quran_refs as Array<Record<string, unknown>>) || [])
      .catch(() => []);
    const merged = [
      ...existingRaw,
      {
        verse_key: ref.verse_key,
        text_uthmani: ref.ayah_data?.text_uthmani || null,
        translation_en: ref.ayah_data?.translation_en || null,
        relevance_note: ref.relevance_note,
      },
    ];
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quran_refs: merged }),
    });
    if (res.ok) {
      setAttachedQuranKeys((prev) => new Set(prev).add(ref.verse_key));
      flash(`Attached ${ref.verse_key}`);
      onAttachedAyah?.();
    } else {
      flash("Attach failed");
    }
  };

  const attachHadith = async (ref: FigureHadithRef) => {
    if (!ref.hadith) return;
    const createRes = await fetch("/api/hadith", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: ref.hadith.sunnah_com_url,
        reference_text: `${ref.hadith.collection_name} ${ref.hadith.hadith_number}`,
        narrator: ref.hadith.narrator,
        arabic_text: ref.hadith.arabic_text,
        translation_en: ref.hadith.english_text,
        grade: ref.hadith.grade,
      }),
    });
    if (!createRes.ok) {
      flash("Attach failed");
      return;
    }
    const { hadith } = await createRes.json();
    const attachRes = await fetch(`/api/posts/${postId}/hadith`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hadith_id: hadith.id }),
    });
    if (attachRes.ok) {
      flash("Attached hadith");
      onAttachedHadith();
    } else {
      flash("Attach failed");
    }
  };

  if (loading) {
    return (
      <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
        <div className="text-[12px] text-white/40">Loading figure…</div>
      </section>
    );
  }
  if (!figure) return null;

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="section-label">Figure context</span>
          <span className="text-[13px] text-white/90 truncate">
            {figure.name_en}
          </span>
          {figure.name_ar ? (
            <span className="text-[12px] text-white/40" dir="rtl">
              · {figure.name_ar}
            </span>
          ) : null}
          <span className="text-[10px] uppercase tracking-wider text-white/40 ml-1">
            {figure.type}
          </span>
          <span className="text-[11px] text-white/45 ml-2 tabular-nums">
            {quranRefs.length} Quran · {hadithRefs.length} hadith
          </span>
        </div>
        <div className="flex items-center gap-2">
          {message ? (
            <span className="text-[11px] text-primary-bright">{message}</span>
          ) : null}
          <span className="text-[11px] text-white/45">{open ? "Hide" : "Show"}</span>
        </div>
      </button>

      {open ? (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-5">
          {figure.bio_short ? (
            <div>
              <div className="section-label mb-1.5">Bio</div>
              <p className="text-[12px] text-white/75 leading-relaxed">
                {figure.bio_short}
              </p>
              <Link
                href={`/figures/${figure.id}`}
                className="mt-1 inline-block text-[11px] text-white/45 hover:text-white/75 underline underline-offset-2"
              >
                Open full profile →
              </Link>
            </div>
          ) : null}

          {hookAngles.length > 0 ? (
            <div>
              <div className="section-label mb-1.5">
                Hook angles ({hookAngles.length}) — click to insert at top
              </div>
              <ul className="space-y-1">
                {hookAngles.map((h, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onPickHookAngle(h.text)}
                      className="w-full text-left px-2.5 py-1.5 rounded text-[12px] text-white/85 hover:text-white hover:bg-white/[0.04] border border-transparent hover:border-white/[0.08]"
                    >
                      {h.category ? (
                        <span className="text-[10px] uppercase tracking-wider text-primary-bright mr-2">
                          {h.category}
                        </span>
                      ) : null}
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {quranRefs.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="section-label">
                  Linked Quran ayahs ({quranRefs.length})
                </div>
                <input
                  value={quranFilter}
                  onChange={(e) => setQuranFilter(e.target.value)}
                  placeholder="Search verse or translation…"
                  className="w-56 bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white/85 focus:outline-none focus:border-white/[0.2]"
                />
              </div>
              {filteredQuran.length === 0 ? (
                <div className="text-[12px] text-white/40">No matches.</div>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {quranSlice.map((r) => (
                      <QuranRow
                        key={r.verse_key}
                        r={r}
                        surahName={
                          surahByNum.get(r.surah)?.name_transliteration || null
                        }
                        attached={attachedQuranKeys.has(r.verse_key)}
                        onAttach={() => attachQuran(r)}
                      />
                    ))}
                  </ul>
                  <Pager
                    total={filteredQuran.length}
                    page={quranPage}
                    onPage={setQuranPage}
                  />
                </>
              )}
            </div>
          ) : null}

          {hadithRefs.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="section-label">
                  Linked hadith ({hadithRefs.length})
                </div>
                <input
                  value={hadithFilter}
                  onChange={(e) => setHadithFilter(e.target.value)}
                  placeholder="Search English text…"
                  className="w-56 bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white/85 focus:outline-none focus:border-white/[0.2]"
                />
              </div>
              {filteredHadith.length === 0 ? (
                <div className="text-[12px] text-white/40">No matches.</div>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {hadithSlice.map((r) => (
                      <HadithRow
                        key={r.hadith_corpus_id}
                        r={r}
                        attached={attachedHadithIds.has(r.hadith_corpus_id)}
                        onAttach={() => attachHadith(r)}
                      />
                    ))}
                  </ul>
                  <Pager
                    total={filteredHadith.length}
                    page={hadithPage}
                    onPage={setHadithPage}
                  />
                </>
              )}
            </div>
          ) : null}

          {quranRefs.length === 0 && hadithRefs.length === 0 ? (
            <div className="text-[12px] text-white/40">
              No linked Quran or hadith refs yet. Link some on the{" "}
              <Link
                href={`/figures/${figure.id}`}
                className="underline underline-offset-2 hover:text-white/70"
              >
                figure page
              </Link>
              .
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function QuranRow({
  r,
  surahName,
  attached,
  onAttach,
}: {
  r: FigureQuranRef;
  surahName: string | null;
  attached: boolean;
  onAttach: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const translation = r.ayah_data?.translation_en || "";
  const snippet =
    translation.length > 100 ? translation.slice(0, 100) + "…" : translation;
  return (
    <li className="p-2 rounded border border-white/[0.04] bg-white/[0.02]">
      <div className="flex items-start gap-2">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-primary-bright uppercase tracking-wider">
              {r.verse_key}
            </span>
            {surahName ? (
              <span className="text-white/50">{surahName}</span>
            ) : null}
          </div>
          <div className="text-[11px] text-white/70 mt-0.5 line-clamp-2">
            {snippet || "(translation not imported)"}
          </div>
        </div>
        {attached ? (
          <span className="shrink-0 text-[10px] text-emerald-300">attached</span>
        ) : (
          <button
            onClick={onAttach}
            className="shrink-0 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.05]"
          >
            Use in post
          </button>
        )}
      </div>
      {expanded ? (
        <div className="mt-2 pt-2 border-t border-white/[0.05]">
          {r.ayah_data?.text_uthmani ? (
            <div
              dir="rtl"
              className="text-[13px] text-white/85 leading-relaxed mb-1"
            >
              {r.ayah_data.text_uthmani}
            </div>
          ) : null}
          {r.ayah_data?.translation_en ? (
            <div className="text-[11px] text-white/60 leading-relaxed mb-2">
              {r.ayah_data.translation_en}
            </div>
          ) : null}
          <AyahTools surah={r.surah} ayah={r.ayah} compact />
        </div>
      ) : null}
    </li>
  );
}

function HadithRow({
  r,
  attached,
  onAttach,
}: {
  r: FigureHadithRef;
  attached: boolean;
  onAttach: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const h = r.hadith;
  if (!h) return null;
  const snippet =
    h.english_text.length > 100
      ? h.english_text.slice(0, 100) + "…"
      : h.english_text;
  return (
    <li className="p-2 rounded border border-white/[0.04] bg-white/[0.02]">
      <div className="flex items-start gap-2">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-primary-bright uppercase tracking-wider truncate max-w-[160px]">
              {h.collection_name} #{h.hadith_number}
            </span>
            {h.grade ? (
              <span className="text-[10px] text-emerald-300">{h.grade}</span>
            ) : null}
          </div>
          <div className="text-[11px] text-white/70 mt-0.5 line-clamp-2">
            {snippet}
          </div>
        </div>
        {attached ? (
          <span className="shrink-0 text-[10px] text-emerald-300">attached</span>
        ) : (
          <button
            onClick={onAttach}
            className="shrink-0 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.05]"
          >
            Use in post
          </button>
        )}
      </div>
      {expanded ? (
        <div className="mt-2 pt-2 border-t border-white/[0.05]">
          {h.arabic_text ? (
            <div dir="rtl" className="text-[13px] text-white/85 leading-relaxed mb-1">
              {h.arabic_text}
            </div>
          ) : null}
          <div className="text-[11px] text-white/70 leading-relaxed">
            {h.english_text}
          </div>
          {h.sunnah_com_url ? (
            <a
              href={h.sunnah_com_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-[10px] text-white/40 hover:text-white/70 underline underline-offset-2"
            >
              sunnah.com →
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Pager({
  total,
  page,
  onPage,
}: {
  total: number;
  page: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / PAGE);
  if (pages <= 1) return null;
  return (
    <div className="mt-2 flex items-center justify-between text-[11px] text-white/45">
      <button
        onClick={() => onPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className="px-2 py-0.5 rounded border border-white/[0.08] hover:text-white disabled:opacity-30"
      >
        ← Prev
      </button>
      <span className="tabular-nums">
        {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}
      </span>
      <button
        onClick={() => onPage(Math.min(pages - 1, page + 1))}
        disabled={page >= pages - 1}
        className="px-2 py-0.5 rounded border border-white/[0.08] hover:text-white disabled:opacity-30"
      >
        Next →
      </button>
    </div>
  );
}
