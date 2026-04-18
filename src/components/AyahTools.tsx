"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Global ayah number (1..6236) for a given surah + ayah. Uses the
 * canonical counts from surah_metadata (matches the Kemal Memon /
 * alquran.cloud numbering used by the CDN).
 */
const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
  110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
  83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
  56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
  11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

export function globalAyahNumber(surah: number, ayah: number): number | null {
  if (surah < 1 || surah > 114) return null;
  if (ayah < 1 || ayah > (SURAH_AYAH_COUNTS[surah - 1] || 0)) return null;
  let n = 0;
  for (let i = 0; i < surah - 1; i++) n += SURAH_AYAH_COUNTS[i];
  return n + ayah;
}

export function recitationAudioUrl(
  surah: number,
  ayah: number,
  reciter: string = "ar.alafasy"
): string | null {
  const n = globalAyahNumber(surah, ayah);
  if (!n) return null;
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${n}.mp3`;
}

type TafsirSlug = "ibn-kathir" | "jalalayn";

type TafsirState = {
  content: string;
  author: string | null;
  group_verse: string | null;
  slug: TafsirSlug;
};

export function AyahTools({
  surah,
  ayah,
  compact,
}: {
  surah: number;
  ayah: number;
  compact?: boolean;
}) {
  const [slug, setSlug] = useState<TafsirSlug>("ibn-kathir");
  const [tafsir, setTafsir] = useState<TafsirState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useMemo(() => recitationAudioUrl(surah, ayah), [surah, ayah]);

  const loadTafsir = useCallback(
    async (nextSlug: TafsirSlug) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/quran/tafsir?surah=${surah}&ayah=${ayah}&tafsir=${nextSlug}`
        );
        const j = await res.json();
        if (!res.ok || !j.content) {
          setError(j.error || `HTTP ${res.status}`);
          return;
        }
        setTafsir({
          content: j.content,
          author: j.author || null,
          group_verse: j.group_verse || null,
          slug: nextSlug,
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [surah, ayah]
  );

  const toggleTafsir = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!tafsir) await loadTafsir(slug);
  };

  const switchSlug = async (next: TafsirSlug) => {
    setSlug(next);
    await loadTafsir(next);
  };

  const togglePlay = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
      audioRef.current.addEventListener("error", () => {
        setPlaying(false);
        setError("Audio failed to load");
      });
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => setError("Audio blocked"));
      setPlaying(true);
    }
  };

  return (
    <div className={compact ? "text-[11px]" : "text-[12px]"}>
      <div className="flex items-center gap-2">
        {audioUrl ? (
          <button
            onClick={togglePlay}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
            title={playing ? "Pause recitation" : "Play recitation"}
          >
            <span aria-hidden>{playing ? "◼" : "▶"}</span>
            <span>{playing ? "Pause" : "Play"}</span>
          </button>
        ) : null}
        <button
          onClick={toggleTafsir}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
        >
          {open ? "Hide tafsir" : "Tafsir"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => switchSlug("ibn-kathir")}
              className={
                slug === "ibn-kathir"
                  ? "px-2 py-0.5 rounded text-[11px] bg-primary/20 text-primary-bright border border-primary/40"
                  : "px-2 py-0.5 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white"
              }
            >
              Ibn Kathir
            </button>
            <button
              onClick={() => switchSlug("jalalayn")}
              className={
                slug === "jalalayn"
                  ? "px-2 py-0.5 rounded text-[11px] bg-primary/20 text-primary-bright border border-primary/40"
                  : "px-2 py-0.5 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white"
              }
            >
              Jalalayn
            </button>
            {tafsir?.author ? (
              <span className="text-[10px] text-white/40 ml-auto">
                {tafsir.author}
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="text-[12px] text-white/45">Loading tafsir…</div>
          ) : error ? (
            <div className="text-[12px] text-danger">{error}</div>
          ) : tafsir ? (
            <>
              {tafsir.group_verse ? (
                <div className="text-[10px] text-white/40 italic mb-2">
                  {tafsir.group_verse}
                </div>
              ) : null}
              <div className="text-[12px] text-white/80 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-1">
                {tafsir.content}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
