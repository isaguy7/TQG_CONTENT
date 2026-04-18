import type { WhisperResult } from "@/lib/transcript";
import { transcriptToText } from "@/lib/transcript";
import {
  getPlatform,
  platformPromptBlock,
  type PlatformId,
} from "@/lib/platform-rules";

/**
 * Distilled voice rules for two modes: Isa's personal tone and the
 * house TQG voice. Exported for Claude prompts and the in-app assistant.
 * The app NEVER generates hadith book+number references.
 */
export const PERSONAL_VOICE_RULES = `=== PERSONAL VOICE ===
- Speak as Isa. Close, direct, and lived-in — not brand polish.
- Drop into a scene; let tension hang. Earn context later.
- Hooks first. Tier 1 (curiosity / provocative / scene) beats Tier 2.
- Fewer morals. Never wrap with "the lesson is...".
- Use the Prophet's (SAW) actual words when cited. No paraphrase.
- Sensory over generic. Verbs active. Fragments welcome.
- No em dashes. No "delve", "realm", "tapestry" style AI sludge.
- Lowercase is deliberate. CTA at most once.
- NEVER generate hadith reference numbers. Say "verify on sunnah.com."
- The draft is a starting point — Isa will rewrite heavily.`;

export const TQG_VOICE_RULES = `=== TQG VOICE ===
- Studio tone: confident craft, cinematic hooks, minimal exposition.
- Drop readers straight into motion; reveal context only as needed.
- Hooks rule reach. Tier 1 (curiosity / provocative / scene) over Tier 2.
- One thread per post. No summaries, no moral-of-the-story wrap-ups.
- Use the Prophet's (SAW) words verbatim when cited. One clean hit is enough.
- Sensory details beat abstractions. Prefer fragments and active subjects.
- No em dashes. No AI filler phrases. Paragraphs stay short.
- Islamic references woven naturally. One CTA max.
- Fade endings out; avoid biographical bows after a strong close.
- NEVER generate hadith reference numbers. Say "verify on sunnah.com."
- Assume a human editor will still tune the draft.`;

// Back-compat for existing imports until callers are updated.
export const WRITING_RULES = TQG_VOICE_RULES;

export type FigureContext = {
  nameEn: string;
  nameAr?: string | null;
  title?: string | null;
  bioShort?: string | null;
  themes?: string[] | null;
  notableEvents?: unknown;
};

export type SystemPromptInput = {
  transcript?: WhisperResult | string | null;
  figure?: FigureContext | null;
  topic?: string | null;
  instruction?: string;
  platform?: PlatformId | string | null;
  voice?: "personal" | "tqg";
};

function defaultInstruction(platformLabel: string): string {
  return `Draft a ${platformLabel} post about {topic}.
Give me 10-15 hook options first, labelled by type
(contrast, provocative, scene, purpose, refusal, dua, scale, loss,
character). Then I'll pick one and we'll iterate on the draft.`;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const parts: string[] = [
    input.voice === "personal" ? PERSONAL_VOICE_RULES : TQG_VOICE_RULES,
  ];

  const platformLabel = input.platform
    ? getPlatform(input.platform).label
    : "LinkedIn";

  if (input.platform) {
    const cfg = getPlatform(input.platform);
    parts.push(`\n=== PLATFORM ===\n${platformPromptBlock(cfg)}`);
  }

  if (input.transcript) {
    const text =
      typeof input.transcript === "string"
        ? input.transcript
        : transcriptToText(input.transcript);
    parts.push(`\n=== TRANSCRIPT ===\n${text.trim()}`);
  }

  if (input.figure) {
    const f = input.figure;
    const lines: string[] = [];
    lines.push(`Name: ${f.nameEn}${f.nameAr ? ` (${f.nameAr})` : ""}`);
    if (f.title) lines.push(`Title: ${f.title}`);
    if (f.bioShort) lines.push(`Bio: ${f.bioShort}`);
    if (f.themes?.length) lines.push(`Themes: ${f.themes.join(", ")}`);
    if (f.notableEvents) {
      lines.push(`Notable events: ${JSON.stringify(f.notableEvents)}`);
    }
    parts.push(`\n=== FIGURE CONTEXT ===\n${lines.join("\n")}`);
  }

  const topicLabel =
    input.topic || input.figure?.nameEn || "the figure/topic above";
  const instruction = (
    input.instruction || defaultInstruction(platformLabel)
  ).replace("{topic}", topicLabel);

  parts.push(`\n=== INSTRUCTION ===\n${instruction}`);

  return parts.join("\n");
}
