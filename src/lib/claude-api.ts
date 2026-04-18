/**
 * Phase 5: Claude API wrapper. All functions are server-only (use Node fetch
 * directly against the Anthropic REST endpoint; no SDK dependency).
 *
 * Behaviour:
 * - If ANTHROPIC_API_KEY is missing, every function returns
 *   { available: false, ... } so the UI falls back to "Copy to Claude.ai".
 * - Every call is logged to api_usage; we enforce API_MONTHLY_CAP before
 *   calling out, and refuse if the current month's spend is >= the cap.
 */
import { createClient } from "@/lib/supabase/admin";
import {
  PERSONAL_VOICE_RULES,
  TQG_VOICE_RULES,
  type FigureContext,
} from "@/lib/system-prompt";
import {
  getPlatform,
  platformPromptBlock,
  type PlatformId,
} from "@/lib/platform-rules";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// Pricing snapshot used only for in-app spend tracking (Sonnet 4 family).
// Update when pricing changes or you switch models with a different rate.
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  default: { input: 3, output: 15 },
};

export type Hook = {
  category: string;
  text: string;
};

type Available<T> = { available: true } & T;
type Unavailable = { available: false; reason: string };
type Result<T> = Available<T> | Unavailable;
type ChatTurn = { role: "user" | "assistant"; content: string };

export type HookResult = Result<{
  hooks: Hook[];
  tokens: number;
  cost: number;
}>;

export type ConvertResult = Result<{
  converted: string;
  tokens: number;
  cost: number;
}>;

export type SlopResult = Result<{
  issues: string[];
  score: number;
  tokens: number;
  cost: number;
}>;

export type AssistantResult = Result<{
  reply: string;
  imageQuery?: string | null;
  tokens: number;
  cost: number;
}>;

export type UsageBreakdown = {
  totalCostUsd: number;
  capUsd: number;
  over: boolean;
  byFeature: Record<string, { count: number; cost: number }>;
  recent: Array<{
    id: string;
    feature: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    created_at: string;
  }>;
};

function apiKey(): string | null {
  const v = process.env.ANTHROPIC_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

function model(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function capUsd(): number {
  const raw = Number(process.env.API_MONTHLY_CAP || "5");
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p =
    PRICING_USD_PER_MTOK[modelId] || PRICING_USD_PER_MTOK.default;
  return (
    (inputTokens * p.input + outputTokens * p.output) / 1_000_000
  );
}

async function currentMonthSpend(userId: string | null): Promise<number> {
  const db = createClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  let q = db
    .from("api_usage")
    .select("estimated_cost_usd")
    .gte("created_at", start.toISOString());
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return 0;
  return (data || []).reduce(
    (sum, r) => sum + Number(r.estimated_cost_usd || 0),
    0
  );
}

async function logUsage(row: {
  feature: "hooks" | "convert" | "suggest" | "slop_check" | "assistant";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  postId?: string | null;
  userId?: string | null;
}): Promise<void> {
  const db = createClient();
  await db.from("api_usage").insert({
    feature: row.feature,
    model: row.model,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    estimated_cost_usd: row.costUsd,
    post_id: row.postId || null,
    user_id: row.userId || null,
  });
}

type MessagesResponse = {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
};

async function callMessages(
  system: string,
  user: string | ChatTurn[],
  maxTokens: number = 2048
): Promise<MessagesResponse> {
  const key = apiKey();
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const messages =
    typeof user === "string"
      ? [{ role: "user" as const, content: user }]
      : user.map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model(),
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function extractText(resp: MessagesResponse): string {
  return (resp.content || [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function tryParseJson<T>(text: string): T | null {
  // The model sometimes wraps JSON in a ```json fence or leading prose.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  // Find the first { or [ and parse from there.
  const start = body.search(/[\[{]/);
  if (start === -1) return null;
  const slice = body.slice(start);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

async function guardCap(userId: string | null): Promise<{
  spent: number;
  cap: number;
  over: boolean;
}> {
  const spent = await currentMonthSpend(userId);
  const cap = capUsd();
  return { spent, cap, over: spent >= cap };
}

export async function generateHooks(input: {
  figure?: FigureContext | null;
  topic?: string | null;
  transcript?: string | null;
  platform?: PlatformId | string | null;
  postId?: string | null;
  userId?: string | null;
}): Promise<HookResult> {
  if (!apiKey()) {
    return { available: false, reason: "no_api_key" };
  }
  const cap = await guardCap(input.userId || null);
  if (cap.over) {
    return {
      available: false,
      reason: `monthly_cap_reached (${cap.spent.toFixed(2)} / ${cap.cap})`,
    };
  }

  const system = `${TQG_VOICE_RULES}

You are writing social-media hooks for "The Quran Group" content studio.
Hooks are first-line openings that determine reach. Tier 1 hooks
(curiosity / provocative / scene) beat Tier 2 (descriptive / factual)
by 8x in measured impressions. One hook per line. No preamble.

Return JSON ONLY, matching this exact schema:
{
  "hooks": [
    { "category": "contrast" | "provocative" | "scene" | "purpose" | "refusal" | "dua" | "scale" | "loss" | "character" | "curiosity", "text": "..." }
  ]
}
Return 10-15 hooks. No markdown. No commentary.`;

  const parts: string[] = [];
  if (input.platform) {
    parts.push(`=== PLATFORM ===\n${platformPromptBlock(getPlatform(input.platform))}`);
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
    parts.push(`=== FIGURE ===\n${lines.join("\n")}`);
  }
  if (input.transcript?.trim()) {
    parts.push(`=== TRANSCRIPT ===\n${input.transcript.trim().slice(0, 6000)}`);
  }
  if (input.topic) parts.push(`=== TOPIC ===\n${input.topic}`);
  const user = parts.length
    ? parts.join("\n\n")
    : "Generate hooks for a general post about Islamic history.";

  const resp = await callMessages(system, user, 2048);
  const text = extractText(resp);
  const parsed = tryParseJson<{ hooks: Hook[] }>(text);
  const hooks = Array.isArray(parsed?.hooks) ? parsed!.hooks : [];

  const inputTokens = resp.usage?.input_tokens || 0;
  const outputTokens = resp.usage?.output_tokens || 0;
  const cost = estimateCost(model(), inputTokens, outputTokens);

  await logUsage({
    feature: "hooks",
    model: model(),
    inputTokens,
    outputTokens,
    costUsd: cost,
    postId: input.postId || null,
    userId: input.userId || null,
  });

  return {
    available: true,
    hooks,
    tokens: inputTokens + outputTokens,
    cost,
  };
}

export async function convertPlatform(input: {
  content: string;
  fromPlatform: PlatformId | string;
  toPlatform: PlatformId | string;
  postId?: string | null;
  userId?: string | null;
}): Promise<ConvertResult> {
  if (!apiKey()) return { available: false, reason: "no_api_key" };
  const cap = await guardCap(input.userId || null);
  if (cap.over) {
    return {
      available: false,
      reason: `monthly_cap_reached (${cap.spent.toFixed(2)} / ${cap.cap})`,
    };
  }

  const fromCfg = getPlatform(input.fromPlatform);
  const toCfg = getPlatform(input.toPlatform);
  const system = `${TQG_VOICE_RULES}

You convert finished social posts between platforms while preserving
voice. You NEVER invent new information. Output the converted post
body only. No commentary, no JSON, no quotes.

=== SOURCE PLATFORM ===
${platformPromptBlock(fromCfg)}

=== TARGET PLATFORM ===
${platformPromptBlock(toCfg)}`;

  const resp = await callMessages(
    system,
    `Convert this post from ${fromCfg.label} to ${toCfg.label}. Keep the hook strong. Respect the target character limit.\n\n${input.content}`,
    1024
  );
  const converted = extractText(resp);

  const inputTokens = resp.usage?.input_tokens || 0;
  const outputTokens = resp.usage?.output_tokens || 0;
  const cost = estimateCost(model(), inputTokens, outputTokens);
  await logUsage({
    feature: "convert",
    model: model(),
    inputTokens,
    outputTokens,
    costUsd: cost,
    postId: input.postId || null,
    userId: input.userId || null,
  });

  return {
    available: true,
    converted,
    tokens: inputTokens + outputTokens,
    cost,
  };
}

export async function checkSlop(input: {
  content: string;
  postId?: string | null;
  userId?: string | null;
}): Promise<SlopResult> {
  if (!apiKey()) return { available: false, reason: "no_api_key" };
  const cap = await guardCap(input.userId || null);
  if (cap.over) {
    return {
      available: false,
      reason: `monthly_cap_reached (${cap.spent.toFixed(2)} / ${cap.cap})`,
    };
  }

  const system = `You are an editor scanning social posts for AI "slop":
em dashes, clichéd openers ("In a world where…", "It's worth noting"),
phrases like "delve", "tapestry", "realm", "multifaceted", LinkedIn
fluff ("game-changer", "unpack"), and any vague wrap-up moralising.
Flag exact spans that sound AI-generated.

Return JSON ONLY:
{
  "issues": ["exact phrase 1", "exact phrase 2"],
  "score": 0-100   // higher = more human, lower = more AI
}
No markdown, no prose.`;

  const resp = await callMessages(system, input.content, 1024);
  const text = extractText(resp);
  const parsed = tryParseJson<{ issues: string[]; score: number }>(text);
  const issues = Array.isArray(parsed?.issues) ? parsed!.issues : [];
  const score =
    typeof parsed?.score === "number" ? Math.max(0, Math.min(100, parsed!.score)) : 50;

  const inputTokens = resp.usage?.input_tokens || 0;
  const outputTokens = resp.usage?.output_tokens || 0;
  const cost = estimateCost(model(), inputTokens, outputTokens);
  await logUsage({
    feature: "slop_check",
    model: model(),
    inputTokens,
    outputTokens,
    costUsd: cost,
    postId: input.postId || null,
    userId: input.userId || null,
  });

  return {
    available: true,
    issues,
    score,
    tokens: inputTokens + outputTokens,
    cost,
  };
}

export async function runAssistantMessage(input: {
  userMessage: string;
  voice?: "personal" | "tqg";
  draft?: string | null;
  platform?: PlatformId | string | null;
  topic?: string | null;
  figure?: FigureContext | null;
  hadith?: Array<{
    reference_text: string;
    narrator?: string | null;
    translation_en?: string | null;
    arabic_text?: string | null;
  }>;
  history?: ChatTurn[];
  postId?: string | null;
  userId?: string | null;
}): Promise<AssistantResult> {
  if (!apiKey()) return { available: false, reason: "no_api_key" };
  const cap = await guardCap(input.userId || null);
  if (cap.over) {
    return {
      available: false,
      reason: `monthly_cap_reached (${cap.spent.toFixed(2)} / ${cap.cap})`,
    };
  }

  const voiceRules =
    input.voice === "personal" ? PERSONAL_VOICE_RULES : TQG_VOICE_RULES;

  const contextParts: string[] = [];
  if (input.platform) {
    contextParts.push(
      `=== PLATFORM ===\n${platformPromptBlock(getPlatform(input.platform))}`
    );
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
    contextParts.push(`=== FIGURE CONTEXT ===\n${lines.join("\n")}`);
  }
  if (input.topic) {
    contextParts.push(`=== TOPIC ===\n${input.topic}`);
  }
  if (input.hadith?.length) {
    const trimmed = input.hadith.slice(0, 4);
    contextParts.push(
      `=== HADITH CONTEXT ===\n${trimmed
        .map((h, i) => {
          const parts: string[] = [];
          parts.push(`${i + 1}. ${h.reference_text}`);
          if (h.narrator) parts.push(`Narrator: ${h.narrator}`);
          if (h.translation_en) parts.push(`EN: ${h.translation_en}`);
          return parts.join("\n");
        })
        .join("\n\n")}`
    );
  }
  const draft = (input.draft || "").trim();
  if (draft) {
    contextParts.push(
      `=== CURRENT DRAFT ===\n${draft.slice(0, 2200)}${
        draft.length > 2200 ? "\n[truncated]" : ""
      }`
    );
  }

  const system = `${voiceRules}

You are the dual-voice assistant for TQG Studio. Keep tone aligned to the active voice and respect Islamic authenticity.
If the user asks for visuals or "image suggestions", include an "image_query" string with search keywords.
Reply concisely. Avoid hadith book/number references — say "verify on sunnah.com."

Return JSON ONLY:
{
  "reply": "markdown-friendly answer to show in chat",
  "image_query": "optional search keywords when visuals are requested"
}`;

  const promptBlocks = [
    `USER REQUEST:\n${input.userMessage.trim()}`,
    contextParts.length > 0 ? `CONTEXT:\n${contextParts.join("\n\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const history = (input.history || []).map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const resp = await callMessages(
    system,
    [...history, { role: "user", content: promptBlocks }],
    2048
  );
  const text = extractText(resp);
  const parsed = tryParseJson<{ reply?: string; image_query?: string }>(text);
  const reply = parsed?.reply?.trim() || text;
  const imageQuery =
    typeof parsed?.image_query === "string"
      ? parsed.image_query.trim()
      : null;

  const inputTokens = resp.usage?.input_tokens || 0;
  const outputTokens = resp.usage?.output_tokens || 0;
  const cost = estimateCost(model(), inputTokens, outputTokens);
  await logUsage({
    feature: "assistant",
    model: model(),
    inputTokens,
    outputTokens,
    costUsd: cost,
    postId: input.postId || null,
    userId: input.userId || null,
  });

  return {
    available: true,
    reply,
    imageQuery,
    tokens: inputTokens + outputTokens,
    cost,
  };
}

export async function getUsageBreakdown(
  userId: string | null
): Promise<UsageBreakdown> {
  const db = createClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  let q = db
    .from("api_usage")
    .select(
      "id,feature,model,input_tokens,output_tokens,estimated_cost_usd,created_at"
    )
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: false });
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;

  const rows = (data || []) as UsageBreakdown["recent"];
  const byFeature: Record<string, { count: number; cost: number }> = {};
  let total = 0;
  for (const r of rows) {
    const cost = Number(r.estimated_cost_usd || 0);
    total += cost;
    const bucket = byFeature[r.feature] || { count: 0, cost: 0 };
    bucket.count += 1;
    bucket.cost += cost;
    byFeature[r.feature] = bucket;
  }
  const cap = capUsd();
  return {
    totalCostUsd: total,
    capUsd: cap,
    over: total >= cap,
    byFeature,
    recent: rows.slice(0, 10),
  };
}

export function claudeAvailable(): boolean {
  return apiKey() !== null;
}
