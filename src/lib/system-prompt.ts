import type { WhisperResult } from "@/lib/transcript";
import { transcriptToText } from "@/lib/transcript";

/**
 * The TQG writing rules distilled from 250+ turns of content iteration.
 * Exported to clipboard for Claude.ai drafting alongside transcript +
 * figure context. The app NEVER generates hadith book+number references.
 */
export const WRITING_RULES = `=== WRITING RULES ===
- Drop into a scene. No setup. Earn context later.
- Hooks determine reach. Favour Tier 1 (curiosity / provocative / scene)
  over Tier 2 (descriptive / factual).
- One thread per post. Reflections woven subtly, never announced.
- Never narrate irony. Never summarise the takeaway. Don't wrap up.
- Use the Prophet's (SAW) actual words, not paraphrases. One hit is enough.
- Sensory over generic. Fragments for effect. Active subjects.
- No em dashes. No AI phrases. Short paragraphs. Lowercase is deliberate.
- Islamic references woven naturally. One CTA max.
- Fade endings out. Cut biographical wrap-ups after strong endings.
- Posts read like talking to a friend.
- NEVER generate hadith reference numbers. Describe the hadith and say
  'verify on sunnah.com.'
- The draft is a starting point. Isa always edits heavily.`;

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
};

const DEFAULT_INSTRUCTION = `Draft a LinkedIn post about {topic}.
Give me 10-15 hook options first, labelled by type
(contrast, provocative, scene, purpose, refusal, dua, scale, loss,
character). Then I'll pick one and we'll iterate on the draft.`;

export function buildSystemPrompt(input: SystemPromptInput): string {
  const parts: string[] = [WRITING_RULES];

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
  const instruction = (input.instruction || DEFAULT_INSTRUCTION).replace(
    "{topic}",
    topicLabel
  );

  parts.push(`\n=== INSTRUCTION ===\n${instruction}`);

  return parts.join("\n");
}
