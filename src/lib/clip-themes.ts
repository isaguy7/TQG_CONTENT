/**
 * Maps Quran/English keywords → background video themes. The clip creator
 * runs this against the English translation (and Arabic transliteration
 * when available) to suggest Pexels search terms for each clip.
 */

export type ThemeCategory =
  | "desert"
  | "ocean"
  | "night-sky"
  | "mountain"
  | "kaaba"
  | "forest"
  | "rain"
  | "dawn";

export const THEME_KEYWORDS: Record<ThemeCategory, string[]> = {
  desert: [
    "fire",
    "hell",
    "jahannam",
    "punishment",
    "heat",
    "burn",
    "dry",
    "scorched",
  ],
  ocean: [
    "water",
    "river",
    "paradise",
    "jannah",
    "flow",
    "rain",
    "mercy",
    "sea",
    "ocean",
  ],
  "night-sky": [
    "night",
    "star",
    "heaven",
    "sky",
    "moon",
    "light",
    "stars",
    "cosmos",
  ],
  mountain: ["mountain", "earth", "firm", "strong", "steadfast", "hill"],
  kaaba: ["prayer", "worship", "hajj", "masjid", "sacred", "holy", "mecca"],
  forest: ["garden", "tree", "grow", "fruit", "shade", "green", "trees"],
  rain: ["rain", "cloud", "storm", "wind", "flood", "thunder"],
  dawn: ["dawn", "fajr", "morning", "sunrise", "light"],
};

/** Pexels-friendly query terms that tend to produce good cinematic results. */
export const THEME_QUERIES: Record<ThemeCategory, string> = {
  desert: "desert landscape cinematic",
  ocean: "ocean waves aerial",
  "night-sky": "night sky stars time lapse",
  mountain: "mountain landscape cinematic",
  kaaba: "mecca kaaba pilgrims",
  forest: "forest green nature aerial",
  rain: "rain clouds storm cinematic",
  dawn: "sunrise dawn cinematic",
};

export const DEFAULT_QUICK_PICK: ThemeCategory[] = [
  "desert",
  "ocean",
  "kaaba",
  "mountain",
  "night-sky",
];

export function matchThemes(text: string, limit = 3): ThemeCategory[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const scores: Array<[ThemeCategory, number]> = [];
  for (const [cat, words] of Object.entries(THEME_KEYWORDS) as Array<
    [ThemeCategory, string[]]
  >) {
    let score = 0;
    for (const w of words) {
      if (lower.includes(w)) score += 1;
    }
    if (score > 0) scores.push([cat, score]);
  }
  return scores
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}
