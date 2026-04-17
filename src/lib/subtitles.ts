import "server-only";

/**
 * Phase 6: ASS subtitle generation for rendered clips.
 *
 * Produces a valid Advanced SubStation Alpha (.ass) file with two
 * styles: `Arabic` (Amiri, large, centered) and `English` (smaller,
 * below). Times are expressed relative to the clip start (i.e. after
 * the ffmpeg `-ss` seek).
 */

export type SubtitleLine = {
  start: number; // seconds (relative to clip)
  end: number;
  arabic: string;
  english?: string | null;
};

export type SubtitleOptions = {
  width?: number;
  height?: number;
  arabicFont?: string;
  englishFont?: string;
};

function fmtTime(t: number): string {
  const tt = Math.max(0, t);
  const h = Math.floor(tt / 3600);
  const m = Math.floor((tt - h * 3600) / 60);
  const s = tt - h * 3600 - m * 60;
  const secWhole = Math.floor(s);
  const cs = Math.round((s - secWhole) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(secWhole).padStart(
    2,
    "0"
  )}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

export function buildAssSubtitles(
  lines: SubtitleLine[],
  opts: SubtitleOptions = {}
): string {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1080;
  const arabicFont = opts.arabicFont ?? "Amiri";
  const englishFont = opts.englishFont ?? "Inter";

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Arabic,${arabicFont},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,4,2,5,60,60,60,1`,
    `Style: English,${englishFont},36,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,60,60,120,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];
  for (const line of lines) {
    if (line.arabic?.trim()) {
      events.push(
        `Dialogue: 0,${fmtTime(line.start)},${fmtTime(line.end)},Arabic,,0,0,0,,${escapeAss(line.arabic.trim())}`
      );
    }
    if (line.english?.trim()) {
      events.push(
        `Dialogue: 0,${fmtTime(line.start)},${fmtTime(line.end)},English,,0,0,0,,${escapeAss(line.english.trim())}`
      );
    }
  }

  return [...header, ...events, ""].join("\n");
}
