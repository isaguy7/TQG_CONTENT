/**
 * Per-platform formatting rules — character limits, optimal ranges,
 * visible-before-truncation thresholds, and plain-English notes.
 * Consumed by the editor UI and by the clipboard system prompt so
 * Claude.ai formats drafts for the right target.
 */

export type PlatformId = "linkedin" | "x" | "instagram" | "facebook";

export type PlatformConfig = {
  id: PlatformId;
  label: string;
  charLimit: number;
  visibleBefore: number;
  optimalRange: [number, number];
  hashtagAdvice: string;
  formatNotes: string[];
  contentType: string;
};

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    charLimit: 3000,
    visibleBefore: 210,
    optimalRange: [1800, 2100],
    hashtagAdvice: "3-5 hashtags at the end",
    formatNotes: [
      "First 210 chars visible before \"see more\" — hook is everything",
      "Short paragraphs with white space between",
      "Posts of 1,800-2,100 chars get highest engagement",
      "No native bold/italic — use line breaks for structure",
      "One thread per post. Reflections woven subtly.",
    ],
    contentType: "Long-form prose with line breaks",
  },
  x: {
    id: "x",
    label: "X (Twitter)",
    charLimit: 280,
    visibleBefore: 280,
    optimalRange: [71, 100],
    hashtagAdvice: "1-3 hashtags at end. Images don't count toward limit.",
    formatNotes: [
      "280 chars max (free). Images/video don't count.",
      "Tweets of 71-100 chars get max engagement",
      "URLs count as 23 chars regardless of length",
      "Emojis count as 2 chars each",
      "No threads until 1,000+ followers — single tweet + image at 12pm BST",
      "Daily single tweet with image + hashtags",
    ],
    contentType: "Single punchy statement + image",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    charLimit: 2200,
    visibleBefore: 125,
    optimalRange: [100, 150],
    hashtagAdvice: "20-30 hashtags work here. Mix popular + niche.",
    formatNotes: [
      "First 125 chars visible before \"more\" button",
      "Reels are THE format — cross-post via Meta Business Suite",
      "Caption supports line breaks but keep it short",
      "Short captions (100-150 chars) + strong visual = best engagement",
      "Cross-post Reels to Facebook automatically",
    ],
    contentType: "Reel with short caption",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    charLimit: 63206,
    visibleBefore: 477,
    optimalRange: [40, 80],
    hashtagAdvice: "1-2 hashtags max. Facebook isn't hashtag-driven.",
    formatNotes: [
      "Posts of 40-80 chars get 66% higher engagement",
      "Cross-post Reels from Instagram via Meta Business Suite",
      "Algorithm favours visual storytelling over text walls",
      "Short teaser + Reel is the winning format",
      "Priority: Low — cross-post only, not original content",
    ],
    contentType: "Short teaser + cross-posted Reel",
  },
};

export function getPlatform(id: string | null | undefined): PlatformConfig {
  if (id && Object.hasOwn(PLATFORMS, id)) {
    return PLATFORMS[id as PlatformId];
  }
  return PLATFORMS.linkedin;
}

export type CharCounterTone = "ok" | "optimal" | "warn" | "over";

/**
 * Colour bucket for the char counter. "optimal" when inside the engagement
 * sweet spot; "ok" for below-optimal drafts; "warn" between optimal and the
 * hard limit; "over" when the post would be rejected by the platform.
 */
export function counterTone(
  count: number,
  config: PlatformConfig
): CharCounterTone {
  if (count > config.charLimit) return "over";
  const [lo, hi] = config.optimalRange;
  if (count >= lo && count <= hi) return "optimal";
  if (count > hi) return "warn";
  return "ok";
}

export function platformPromptBlock(config: PlatformConfig): string {
  const [lo, hi] = config.optimalRange;
  const fmt = (n: number) => n.toLocaleString();
  const notes = config.formatNotes.map((n) => `- ${n}`).join("\n");
  return [
    `Platform: ${config.label}`,
    `Character limit: ${fmt(config.charLimit)}`,
    `Optimal length: ${fmt(lo)}-${fmt(hi)} characters`,
    `First ${config.visibleBefore} characters visible before truncation`,
    `Format: ${config.contentType}`,
    `Hashtags: ${config.hashtagAdvice}`,
    `Notes:`,
    notes,
  ].join("\n");
}
