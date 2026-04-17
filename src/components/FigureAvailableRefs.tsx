"use client";

import { useCallback, useEffect, useState } from "react";

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

type QuranAyah = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
};

type FigureQuranRef = {
  verse_key: string;
  relevance_note: string | null;
  tafseer_note: string | null;
  ayah_data: QuranAyah | null;
};

type Props = {
  figureId: string;
  figureName: string;
  postId: string;
  attachedHadithIds: Set<string>;
  onAttachedHadith: () => void;
};

/**
 * Available references sidebar, used on the post editor when a figure is
 * attached. One-click attach from the figure's pre-linked hadith and Quran
 * refs. Quran refs write into posts.quran_refs as a jsonb array.
 */
export function FigureAvailableRefs({
  figureId,
  figureName,
  postId,
  attachedHadithIds,
  onAttachedHadith,
}: Props) {
  const [hadithRefs, setHadithRefs] = useState<FigureHadithRef[]>([]);
  const [quranRefs, setQuranRefs] = useState<FigureQuranRef[]>([]);
  const [attachedQuranKeys, setAttachedQuranKeys] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, q, p] = await Promise.all([
      fetch(`/api/figures/${figureId}/hadith`).then((r) => r.json()),
      fetch(`/api/figures/${figureId}/quran`).then((r) => r.json()),
      fetch(`/api/posts/${postId}`).then((r) => r.json()),
    ]);
    setHadithRefs(h.items || []);
    setQuranRefs(q.items || []);
    const existing = (p.post?.quran_refs || []) as Array<{
      verse_key?: string;
    }>;
    setAttachedQuranKeys(
      new Set(existing.map((e) => e.verse_key).filter(Boolean) as string[])
    );
    setLoading(false);
  }, [figureId, postId]);

  useEffect(() => {
    load();
  }, [load]);

  const attachHadithToPost = async (ref: FigureHadithRef) => {
    if (!ref.hadith) return;
    // Two-step: create a hadith_verifications row from the corpus entry,
    // then attach it to the post. Both stay UNVERIFIED until the user
    // manually verifies on /hadith before publishing.
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
      const j = await createRes.json().catch(() => ({}));
      setMessage(`Failed: ${j.error || createRes.status}`);
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    const { hadith } = await createRes.json();
    const attachRes = await fetch(`/api/posts/${postId}/hadith`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hadith_id: hadith.id }),
    });
    if (attachRes.ok) {
      setMessage("Attached · verify before publish");
      setTimeout(() => setMessage(null), 2000);
      onAttachedHadith();
    } else {
      const j = await attachRes.json().catch(() => ({}));
      setMessage(`Failed: ${j.error || attachRes.status}`);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const attachQuranToPost = async (ref: FigureQuranRef) => {
    const current = Array.from(attachedQuranKeys);
    if (current.includes(ref.verse_key)) return;
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
        tafseer_note: ref.tafseer_note,
      },
    ];
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quran_refs: merged }),
    });
    if (res.ok) {
      setAttachedQuranKeys(new Set([...current, ref.verse_key]));
      setMessage(`Attached ${ref.verse_key}`);
      setTimeout(() => setMessage(null), 1800);
    } else {
      const j = await res.json().catch(() => ({}));
      setMessage(`Failed: ${j.error || res.status}`);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const availableHadith = hadithRefs.filter(
    (r) => !attachedHadithIds.has(r.hadith_corpus_id)
  );
  const availableQuran = quranRefs.filter(
    (r) => !attachedQuranKeys.has(r.verse_key)
  );

  if (loading) return null;
  if (hadithRefs.length === 0 && quranRefs.length === 0) return null;

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">
          Available references from {figureName}
        </span>
        {message ? (
          <span className="text-[11px] text-primary-bright">{message}</span>
        ) : null}
      </div>

      {availableQuran.length > 0 ? (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2">
            Quran ({availableQuran.length})
          </div>
          <ul className="space-y-1.5">
            {availableQuran.map((r) => (
              <li
                key={r.verse_key}
                className="flex items-start gap-2 p-2 rounded border border-white/[0.04] bg-white/[0.02]"
              >
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-primary-bright mt-0.5">
                  {r.verse_key}
                </span>
                <div className="flex-1 min-w-0">
                  {r.ayah_data ? (
                    <>
                      <div
                        dir="rtl"
                        className="text-[12px] text-white/80 line-clamp-1"
                      >
                        {r.ayah_data.text_uthmani}
                      </div>
                      {r.ayah_data.translation_en ? (
                        <div className="text-[11px] text-white/50 line-clamp-1 mt-0.5">
                          {r.ayah_data.translation_en}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-[11px] text-white/40">
                      {r.relevance_note || "(Quran not imported)"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => attachQuranToPost(r)}
                  className="shrink-0 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
                >
                  Attach
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {availableHadith.length > 0 ? (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/40 mb-2">
            Hadith ({availableHadith.length})
          </div>
          <ul className="space-y-1.5">
            {availableHadith.map((r) => (
              <li
                key={r.hadith_corpus_id}
                className="flex items-start gap-2 p-2 rounded border border-white/[0.04] bg-white/[0.02]"
              >
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-primary-bright mt-0.5 truncate max-w-[100px]">
                  {r.hadith
                    ? `${r.hadith.collection} #${r.hadith.hadith_number}`
                    : "—"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-white/70 line-clamp-2">
                    {r.hadith?.english_text || r.relevance_note}
                  </div>
                </div>
                <button
                  onClick={() => attachHadithToPost(r)}
                  className="shrink-0 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
                >
                  Attach
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {availableHadith.length === 0 && availableQuran.length === 0 ? (
        <div className="text-[12px] text-white/40">
          All of this figure&apos;s references are already attached.
        </div>
      ) : null}
    </section>
  );
}
