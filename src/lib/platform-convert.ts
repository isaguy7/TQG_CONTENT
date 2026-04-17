/**
 * Rough conversion helpers between platforms. These produce starting
 * points, not finished posts — the editor still expects a human pass.
 */
import { PLATFORMS } from "@/lib/platform-rules";

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : trimmed.split(/\n/, 1)[0]).trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * LinkedIn → X. Pull the hook (first strong sentence or the first line)
 * and trim hard to the X limit. Appends a reminder that the image is
 * carried separately.
 */
export function linkedinToX(content: string): string {
  const limit = PLATFORMS.x.charLimit;
  const hook = firstSentence(content) || content.trim();
  const body = truncate(hook, limit - 20);
  const suffix = body.length <= limit - 20 ? "\n\n[image →]" : "";
  return `${body}${suffix}`.trim();
}

/**
 * LinkedIn → Instagram. Use a punchy caption (first 1-2 lines) under the
 * visible-before threshold and note that the Reel carries the weight.
 */
export function linkedinToInstagram(content: string): string {
  const { visibleBefore } = PLATFORMS.instagram;
  const lines = content.split(/\n+/).filter(Boolean);
  const teaser = (lines[0] || content).trim();
  const short = truncate(teaser, visibleBefore);
  return `${short}\n\n[Reel is primary — caption is the hook only]`;
}

/**
 * LinkedIn → Facebook. 40-80 char teaser + Reel.
 */
export function linkedinToFacebook(content: string): string {
  const [, hi] = PLATFORMS.facebook.optimalRange;
  const hook = firstSentence(content) || content.trim();
  return `${truncate(hook, hi)}\n\n[Cross-posted Reel →]`;
}
