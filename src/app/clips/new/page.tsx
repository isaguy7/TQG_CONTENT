"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";

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

type ClipDraft = {
  id: string;
  start: number;
  end: number;
  background: string;
  arabic: string;
  english: string;
};

const MAX_CLIP = 20;

export default function NewClipBatchPage() {
  const [recitations, setRecitations] = useState<AssetFile[]>([]);
  const [backgrounds, setBackgrounds] = useState<AssetFile[]>([]);
  const [recitationsDir, setRecitationsDir] = useState<string>("");
  const [backgroundsDir, setBackgroundsDir] = useState<string>("");
  const [recitation, setRecitation] = useState<string>("");
  const [defaultBg, setDefaultBg] = useState<string>("");
  const [matchInput, setMatchInput] = useState<string>("");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matching, setMatching] = useState(false);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{
    results: Array<{ output: string; ok: boolean; error?: string }>;
  } | null>(null);
  const [batchName, setBatchName] = useState<string>("");

  useEffect(() => {
    fetch("/api/clips/assets")
      .then((r) => r.json())
      .then((j) => {
        setRecitations(j.recitations || []);
        setBackgrounds(j.backgrounds || []);
        setRecitationsDir(j.recitations_dir || "");
        setBackgroundsDir(j.backgrounds_dir || "");
        if (j.recitations?.[0]) setRecitation(j.recitations[0].path);
        if (j.backgrounds?.[0]) setDefaultBg(j.backgrounds[0].path);
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

  const addClipFromMatch = (m: MatchResult) => {
    const id = crypto.randomUUID();
    const start = clips.length > 0 ? clips[clips.length - 1].end + 0.2 : 0;
    setClips([
      ...clips,
      {
        id,
        start,
        end: Math.min(start + 10, start + MAX_CLIP),
        background: defaultBg,
        arabic: m.text_uthmani,
        english: m.translation_en || "",
      },
    ]);
  };

  const addBlankClip = () => {
    const id = crypto.randomUUID();
    const start = clips.length > 0 ? clips[clips.length - 1].end + 0.2 : 0;
    setClips([
      ...clips,
      {
        id,
        start,
        end: start + 10,
        background: defaultBg,
        arabic: "",
        english: "",
      },
    ]);
  };

  const updateClip = (id: string, patch: Partial<ClipDraft>) => {
    setClips(clips.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeClip = (id: string) => {
    setClips(clips.filter((c) => c.id !== id));
  };

  const canRender =
    recitation &&
    clips.length > 0 &&
    clips.every(
      (c) =>
        c.background &&
        c.end > c.start &&
        c.end - c.start <= MAX_CLIP &&
        c.arabic.trim().length > 0
    );

  const render = async () => {
    if (!canRender) return;
    setRendering(true);
    setRenderResult(null);
    try {
      const body = {
        batch_name: batchName || undefined,
        recitation_audio: recitation,
        clips: clips.map((c, i) => ({
          start_time: c.start,
          end_time: c.end,
          background_video: c.background,
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
      setRenderResult(j);
    } catch (err) {
      setRenderResult({
        results: [{ output: "", ok: false, error: (err as Error).message }],
      });
    } finally {
      setRendering(false);
    }
  };

  return (
    <PageShell
      title="New clip batch"
      description="Short-form Quran recitation clips — max 20s each"
    >
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Step 1: recitation */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">1. Recitation audio</span>
            <span className="text-[11px] text-white/40 truncate max-w-[60%]">
              {recitationsDir}
            </span>
          </div>
          {recitations.length === 0 ? (
            <div className="text-[12px] text-white/40">
              Drop MP3/WAV/M4A files into the recitations folder and refresh.
            </div>
          ) : (
            <select
              value={recitation}
              onChange={(e) => setRecitation(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-3 py-2 text-[13px] text-white/85"
            >
              {recitations.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.name} ({(r.size / 1024 / 1024).toFixed(1)} MB)
                </option>
              ))}
            </select>
          )}
        </section>

        {/* Step 2: quran matcher */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">2. Identify ayahs</span>
          </div>
          <p className="text-[12px] text-white/50 mb-2 leading-relaxed">
            Paste the Arabic (or a chunk of it). Matcher returns ranked candidates
            you can drop straight into a clip. Isa (hafiz) still verifies every
            pick.
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
                  <div className="text-[14px] text-white/85 leading-relaxed" dir="rtl">
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

        {/* Step 3: clip list */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">
              3. Clips ({clips.length}) · total {totalDuration.toFixed(1)}s
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
              Use the matcher above, or add a blank clip to type in manually.
            </div>
          ) : (
            <ul className="space-y-2">
              {clips.map((c, idx) => {
                const dur = c.end - c.start;
                const over = dur > MAX_CLIP;
                return (
                  <li
                    key={c.id}
                    className="p-3 rounded border border-white/[0.06] bg-white/[0.02] space-y-2"
                  >
                    <div className="flex items-center gap-3">
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
                        {dur.toFixed(1)}s {over ? "· over 20s" : ""}
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => removeClip(c.id)}
                        className="text-[11px] text-white/40 hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>
                    <select
                      value={c.background}
                      onChange={(e) =>
                        updateClip(c.id, { background: e.target.value })
                      }
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
                    >
                      <option value="">— select background —</option>
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
                      placeholder="Arabic text for this clip"
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

        {/* Step 4: render */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="section-label">4. Render</span>
            <input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Batch name (optional)"
              className="flex-1 bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
            />
            <button
              onClick={render}
              disabled={!canRender || rendering}
              className="px-3 py-1.5 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {rendering ? "Rendering…" : "Render all"}
            </button>
          </div>
          {!canRender ? (
            <div className="text-[12px] text-white/40">
              Each clip needs a background and Arabic text; duration ≤ 20s.
            </div>
          ) : null}
          {renderResult ? (
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
