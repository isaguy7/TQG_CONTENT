"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import {
  CLIP_PLATFORMS,
  type ClipPlatformId,
} from "@/lib/clip-platforms";
import { StockBackgrounds } from "@/components/StockBackgrounds";

type AssetFile = { name: string; path: string; size: number };
type MatchResult = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
  score: number;
  matched_window: string;
};

type Ayah = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
};

type Suggestion = {
  key: string;
  surah: number;
  name_en: string;
  name_ar: string;
  ayah_count: number;
  est_seconds: number;
  best_for: ClipPlatformId[];
  verse_range: string;
};

type ClipDraft = {
  id: string;
  start: number;
  end: number;
  background: string;
  arabic: string;
  english: string;
  recitation: string; // per-clip
  platform: ClipPlatformId;
};

const PLATFORM_LIST = Object.values(CLIP_PLATFORMS);

export default function NewClipBatchPage() {
  const [recitations, setRecitations] = useState<AssetFile[]>([]);
  const [backgrounds, setBackgrounds] = useState<AssetFile[]>([]);
  const [recitationsDir, setRecitationsDir] = useState<string>("");
  const [backgroundsDir, setBackgroundsDir] = useState<string>("");
  const [defaultRecitation, setDefaultRecitation] = useState<string>("");
  const [defaultBg, setDefaultBg] = useState<string>("");
  const [defaultPlatform, setDefaultPlatform] =
    useState<ClipPlatformId>("x");
  const [matchInput, setMatchInput] = useState<string>("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matching, setMatching] = useState(false);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{
    results?: Array<{ output: string; ok: boolean; error?: string }>;
    queued?: boolean;
    batch_id?: string | null;
    status?: string;
    error?: string;
  } | null>(null);
  const [batchName, setBatchName] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [quranImported, setQuranImported] = useState(true);
  const [loadingSurah, setLoadingSurah] = useState<number | null>(null);
  const [hosted, setHosted] = useState(false);

  useEffect(() => {
    fetch("/api/environment", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHosted(!!j?.hosted))
      .catch(() => setHosted(false));
  }, []);

  const refreshAssets = () => {
    fetch("/api/clips/assets")
      .then((r) => r.json())
      .then((j) => {
        setRecitations(j.recitations || []);
        setBackgrounds(j.backgrounds || []);
        setRecitationsDir(j.recitations_dir || "");
        setBackgroundsDir(j.backgrounds_dir || "");
        if (!defaultRecitation && j.recitations?.[0]) {
          setDefaultRecitation(j.recitations[0].path);
        }
        if (!defaultBg && j.backgrounds?.[0]) {
          setDefaultBg(j.backgrounds[0].path);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/clips/suggestions")
      .then((r) => r.json())
      .then((j) => {
        setSuggestions(j.suggestions || []);
        setQuranImported(!!j.quran_imported);
      })
      .catch(() => {});
  }, []);

  const totalDuration = useMemo(
    () => clips.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0),
    [clips]
  );

  const runMatch = async () => {
    if (!matchInput.trim()) return;
    setMatching(true);
    try {
      const r = await fetch(
        `/api/quran/match?text=${encodeURIComponent(matchInput)}`
      );
      const j = await r.json();
      setMatches(j.matches || []);
    } finally {
      setMatching(false);
    }
  };

  const nextStart = () =>
    clips.length > 0 ? clips[clips.length - 1].end + 0.2 : 0;

  const addClipFromMatch = (m: MatchResult) => {
    const start = nextStart();
    const preset = CLIP_PLATFORMS[defaultPlatform];
    setClips([
      ...clips,
      {
        id: crypto.randomUUID(),
        start,
        end: Math.min(start + 10, start + preset.maxSeconds),
        background: defaultBg,
        arabic: m.text_uthmani,
        english: m.translation_en || "",
        recitation: defaultRecitation,
        platform: defaultPlatform,
      },
    ]);
  };

  const addBlankClip = () => {
    const start = nextStart();
    const preset = CLIP_PLATFORMS[defaultPlatform];
    setClips([
      ...clips,
      {
        id: crypto.randomUUID(),
        start,
        end: Math.min(start + 10, start + preset.maxSeconds),
        background: defaultBg,
        arabic: "",
        english: "",
        recitation: defaultRecitation,
        platform: defaultPlatform,
      },
    ]);
  };

  const addFromSuggestion = async (s: Suggestion) => {
    if (!quranImported) return;
    setLoadingSurah(s.surah);
    try {
      const r = await fetch(`/api/quran/surah/${s.surah}`);
      if (!r.ok) return;
      const { ayahs } = (await r.json()) as { ayahs: Ayah[] };
      const arabic = ayahs.map((a) => a.text_uthmani).join(" ");
      const english = ayahs
        .map((a) => a.translation_en)
        .filter(Boolean)
        .join(" ");
      const platform = s.best_for[0] || defaultPlatform;
      const preset = CLIP_PLATFORMS[platform];
      const start = nextStart();
      setClips([
        ...clips,
        {
          id: crypto.randomUUID(),
          start,
          end: Math.min(start + s.est_seconds, start + preset.maxSeconds),
          background: defaultBg,
          arabic,
          english,
          recitation: defaultRecitation,
          platform,
        },
      ]);
    } finally {
      setLoadingSurah(null);
    }
  };

  const updateClip = (id: string, patch: Partial<ClipDraft>) => {
    setClips(clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeClip = (id: string) => {
    setClips(clips.filter((c) => c.id !== id));
  };

  const canRender =
    clips.length > 0 &&
    clips.every((c) => {
      const preset = CLIP_PLATFORMS[c.platform];
      const dur = c.end - c.start;
      return (
        c.background &&
        c.recitation &&
        c.end > c.start &&
        dur <= preset.maxSeconds &&
        c.arabic.trim().length > 0
      );
    });

  const render = async () => {
    if (!canRender) return;
    setRendering(true);
    setRenderResult(null);
    try {
      const body = {
        batch_name: batchName || undefined,
        recitation_audio: defaultRecitation || undefined,
        platform: defaultPlatform,
        clips: clips.map((c, i) => ({
          start_time: c.start,
          end_time: c.end,
          background_video: c.background,
          recitation_audio: c.recitation,
          platform: c.platform,
          output_name: `clip-${String(i + 1).padStart(2, "0")}`,
          subtitles: [
            {
              start: 0,
              end: c.end - c.start,
              arabic: c.arabic,
              english: c.english,
            },
          ],
        })),
      };
      const r = await fetch("/api/clips/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setRenderResult({ error: j.error || `HTTP ${r.status}` });
        return;
      }
      setRenderResult({
        results: j.results,
        queued: j.queued,
        batch_id: j.batch_id,
        status: j.status,
        error: j.error,
      });
    } catch (err) {
      setRenderResult({
        results: [{ output: "", ok: false, error: (err as Error).message }],
      });
    } finally {
      setRendering(false);
    }
  };

  const exportCaptions = () => {
    if (clips.length === 0) return;
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const srtTime = (t: number) => {
      const tt = Math.max(0, t);
      const h = Math.floor(tt / 3600);
      const m = Math.floor((tt - h * 3600) / 60);
      const s = tt - h * 3600 - m * 60;
      const sec = Math.floor(s);
      const ms = Math.round((s - sec) * 1000);
      return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
    };
    const lines: string[] = [];
    let cursor = 0;
    clips.forEach((c, i) => {
      const dur = Math.max(0, c.end - c.start);
      const start = cursor;
      const end = cursor + dur;
      const text = [c.arabic, c.english].filter((t) => t && t.trim()).join("\n");
      if (text) {
        lines.push(String(i + 1));
        lines.push(`${srtTime(start)} --> ${srtTime(end)}`);
        lines.push(text);
        lines.push("");
      }
      cursor = end;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${batchName || "clip-captions"}.srt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, Suggestion[]> = {
      x: [],
      instagram_reels: [],
      youtube_shorts: [],
    };
    for (const s of suggestions) {
      for (const p of s.best_for) {
        if (groups[p]) groups[p].push(s);
      }
    }
    return groups;
  }, [suggestions]);

  return (
    <PageShell
      title="New clip batch"
      description="Short-form Quran recitation clips — mix platforms and sources per clip"
    >
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Batch defaults */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">Batch defaults</span>
            <span className="text-[11px] text-white/40 truncate max-w-[50%]">
              {recitationsDir}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-white/50">
                Default recitation
              </span>
              {recitations.length === 0 ? (
                <div className="mt-1 text-[12px] text-white/40">
                  No audio yet — drop MP3/WAV into the recitations folder.
                </div>
              ) : (
                <select
                  value={defaultRecitation}
                  onChange={(e) => setDefaultRecitation(e.target.value)}
                  className="mt-1 w-full bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-[12px] text-white/85"
                >
                  {recitations.map((r) => (
                    <option key={r.path} value={r.path}>
                      {r.name} ({(r.size / 1024 / 1024).toFixed(1)} MB)
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="block">
              <span className="text-[11px] text-white/50">
                Default platform
              </span>
              <select
                value={defaultPlatform}
                onChange={(e) =>
                  setDefaultPlatform(e.target.value as ClipPlatformId)
                }
                className="mt-1 w-full bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-[12px] text-white/85"
              >
                {PLATFORM_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.width}×{p.height} · {p.maxSeconds}s
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-[11px] text-white/40 leading-relaxed">
            Each clip inherits these defaults but can override its own
            recitation and platform below.
          </p>
        </section>

        {/* Suggestions */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">Suggestions</span>
            <span className="text-[11px] text-white/40">
              Click to add · adjust timing after
            </span>
          </div>
          {!quranImported ? (
            <div className="rounded bg-amber-500/10 border border-amber-400/30 text-amber-100 text-[12px] p-2 leading-relaxed">
              Import Quran data first:{" "}
              <code className="font-mono text-[11px] bg-black/30 px-1 rounded">
                node scripts/import-quran.mjs
              </code>
            </div>
          ) : (
            <div className="space-y-3">
              {(
                [
                  ["x", "X (under 20s)"],
                  ["instagram_reels", "Reels (15-30s)"],
                  ["youtube_shorts", "Shorts (up to 60s)"],
                ] as Array<[ClipPlatformId, string]>
              ).map(([key, label]) => {
                const items = groupedSuggestions[key] || [];
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">
                      {label}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map((s) => (
                        <button
                          key={`${key}-${s.surah}`}
                          onClick={() => addFromSuggestion(s)}
                          disabled={loadingSurah === s.surah}
                          className="text-left px-3 py-2 rounded border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15] transition-colors disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-medium text-white/85">
                              {s.name_en}
                            </span>
                            <span
                              dir="rtl"
                              className="text-[11px] text-white/55"
                            >
                              {s.name_ar}
                            </span>
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">
                            {s.ayah_count} ayah · ~{s.est_seconds}s
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Quran matcher */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">Identify ayahs by text</span>
          </div>
          <p className="text-[12px] text-white/50 mb-2 leading-relaxed">
            Paste the Arabic (or a chunk of it). Matcher returns ranked
            candidates you can drop straight into a clip.
          </p>
          <textarea
            value={matchInput}
            onChange={(e) => setMatchInput(e.target.value)}
            placeholder="Paste Arabic text here"
            className="w-full bg-transparent border border-white/[0.08] rounded px-3 py-2 text-[14px] text-white/90 leading-relaxed min-h-[80px] focus:outline-none focus:border-white/[0.2]"
            dir="rtl"
          />
          <div className="flex items-center justify-end mt-2">
            <button
              onClick={runMatch}
              disabled={matching || !matchInput.trim()}
              className="px-3 py-1.5 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {matching ? "Matching…" : "Find ayahs"}
            </button>
          </div>
          {matches.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {matches.map((m) => (
                <li
                  key={m.verse_key}
                  className="p-2 rounded border border-white/[0.06] bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] uppercase tracking-wider text-primary-bright">
                      {m.verse_key} · {(m.score * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={() => addClipFromMatch(m)}
                      className="px-2 py-0.5 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
                    >
                      + Add as clip
                    </button>
                  </div>
                  <div
                    className="text-[14px] text-white/85 leading-relaxed"
                    dir="rtl"
                  >
                    {m.text_uthmani}
                  </div>
                  {m.translation_en ? (
                    <div className="text-[11px] text-white/45 mt-1">
                      {m.translation_en}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Backgrounds — local + stock */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">Backgrounds</span>
            <span className="text-[11px] text-white/40 truncate max-w-[60%]">
              {backgroundsDir}
            </span>
          </div>
          <StockBackgrounds
            orientation={
              CLIP_PLATFORMS[defaultPlatform].height >
              CLIP_PLATFORMS[defaultPlatform].width
                ? "portrait"
                : "square"
            }
            seedText={
              clips.length > 0 ? clips[clips.length - 1].english : undefined
            }
            onDownloaded={() => refreshAssets()}
          />
        </section>

        {/* Clip list */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">
              Clips ({clips.length}) · total {totalDuration.toFixed(1)}s
            </span>
            <button
              onClick={addBlankClip}
              className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
            >
              + Blank clip
            </button>
          </div>
          <div className="text-[11px] text-white/40 mb-2">
            Backgrounds: {backgroundsDir}
          </div>
          {clips.length === 0 ? (
            <div className="text-[12px] text-white/40">
              Use a suggestion, match by text, or add a blank clip.
            </div>
          ) : (
            <ul className="space-y-2">
              {clips.map((c, idx) => {
                const preset = CLIP_PLATFORMS[c.platform];
                const dur = c.end - c.start;
                const over = dur > preset.maxSeconds;
                return (
                  <li
                    key={c.id}
                    className="p-3 rounded border border-white/[0.06] bg-white/[0.02] space-y-2"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-white/50">
                        #{idx + 1}
                      </span>
                      <label className="flex items-center gap-1 text-[11px] text-white/60">
                        start
                        <input
                          type="number"
                          step={0.1}
                          value={c.start}
                          onChange={(e) =>
                            updateClip(c.id, {
                              start: Number(e.target.value) || 0,
                            })
                          }
                          className="w-20 bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85 tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-white/60">
                        end
                        <input
                          type="number"
                          step={0.1}
                          value={c.end}
                          onChange={(e) =>
                            updateClip(c.id, {
                              end: Number(e.target.value) || 0,
                            })
                          }
                          className="w-20 bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85 tabular-nums"
                        />
                      </label>
                      <span
                        className={cn(
                          "text-[11px] tabular-nums",
                          over ? "text-danger" : "text-white/50"
                        )}
                      >
                        {dur.toFixed(1)}s
                        {over ? ` · over ${preset.maxSeconds}s` : ""}
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => removeClip(c.id)}
                        className="text-[11px] text-white/40 hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <select
                        value={c.platform}
                        onChange={(e) =>
                          updateClip(c.id, {
                            platform: e.target.value as ClipPlatformId,
                          })
                        }
                        className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
                      >
                        {PLATFORM_LIST.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label} · {p.aspectLabel} · {p.maxSeconds}s
                          </option>
                        ))}
                      </select>
                      <select
                        value={c.recitation}
                        onChange={(e) =>
                          updateClip(c.id, { recitation: e.target.value })
                        }
                        className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
                      >
                        <option value="">— recitation —</option>
                        {recitations.map((r) => (
                          <option key={r.path} value={r.path}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select
                      value={c.background}
                      onChange={(e) =>
                        updateClip(c.id, { background: e.target.value })
                      }
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
                    >
                      <option value="">— background —</option>
                      {backgrounds.map((b) => (
                        <option key={b.path} value={b.path}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={c.arabic}
                      onChange={(e) =>
                        updateClip(c.id, { arabic: e.target.value })
                      }
                      placeholder="Arabic text"
                      dir="rtl"
                      className="w-full bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[13px] text-white/90 focus:outline-none focus:border-white/[0.2]"
                    />
                    <textarea
                      value={c.english}
                      onChange={(e) =>
                        updateClip(c.id, { english: e.target.value })
                      }
                      placeholder="English translation (optional)"
                      className="w-full bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/75 focus:outline-none focus:border-white/[0.2]"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Render */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <span className="section-label">Render / export</span>
            <input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Batch name (optional)"
              className="flex-1 min-w-[140px] bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
            />
            <button
              onClick={exportCaptions}
              disabled={clips.length === 0}
              className="px-3 py-1.5 rounded text-[12px] border border-white/[0.1] text-white/80 hover:text-white hover:bg-white/[0.05] disabled:opacity-40"
            >
              Export .srt
            </button>
            <button
              onClick={render}
              disabled={!canRender || rendering}
              className="px-3 py-1.5 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {rendering
                ? hosted
                  ? "Queuing…"
                  : "Rendering…"
                : hosted
                  ? "Add to render queue"
                  : "Render all"}
            </button>
          </div>
          {hosted ? (
            <div className="text-[12px] text-emerald-100 bg-emerald-500/[0.08] border border-emerald-400/25 rounded px-2 py-1.5 mb-2 leading-relaxed">
              Added batches are queued. Open <code className="font-mono">/queue</code> on your
              local Studio to process them with ffmpeg/GPU.
            </div>
          ) : null}
          {!canRender ? (
            <div className="text-[12px] text-white/40">
              Each clip needs a recitation, background, Arabic text, and a
              duration within its platform&apos;s max.
            </div>
          ) : null}
          {renderResult?.queued ? (
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-100 text-[12px] px-3 py-2">
              Added to render queue. Process on your local Studio in the{" "}
              <Link href="/queue" className="underline underline-offset-2">
                queue page
              </Link>
              .
            </div>
          ) : null}
          {renderResult?.error ? (
            <div className="rounded-lg border border-danger/40 bg-danger/[0.08] text-danger text-[12px] px-3 py-2">
              {renderResult.error}
            </div>
          ) : null}
          {renderResult?.results ? (
            <ul className="space-y-1">
              {renderResult.results.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    "text-[12px] px-2 py-1 rounded border",
                    r.ok
                      ? "bg-emerald-500/[0.08] border-emerald-400/30 text-emerald-100"
                      : "bg-danger/[0.08] border-danger/30 text-danger"
                  )}
                >
                  {r.ok ? "✓" : "×"} {r.output}
                  {r.error ? ` — ${r.error}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
