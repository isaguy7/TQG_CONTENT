/**
 * Phase 7: Typefully API wrapper.
 *
 * Public docs: https://support.typefully.com/en/articles/8718287-typefully-api
 * The v1 REST API uses an `X-API-KEY` header. Drafts are created via
 * POST /drafts/ with a `content` string. Threads are separated with
 * `\n\n\n\n` per Typefully's documented multi-tweet convention.
 *
 * If TYPEFULLY_API_KEY is not set, every function returns
 * { available: false } so the editor can silently hide the buttons.
 */

const BASE = "https://api.typefully.com/v1";

type Available<T> = { available: true } & T;
type Unavailable = { available: false; reason: string };
type Result<T> = Available<T> | Unavailable;

export type TypefullyDraft = {
  id: string | number;
  share_url?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
};

function apiKey(): string | null {
  const v = process.env.TYPEFULLY_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

export function typefullyAvailable(): boolean {
  return apiKey() !== null;
}

async function callTypefully<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("TYPEFULLY_API_KEY missing");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Typefully ${res.status} ${res.statusText}: ${body.slice(0, 300)}`
    );
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export type CreateDraftInput = {
  content: string;
  threadify?: boolean;
  share?: boolean;
  schedule_date?: string | "next-free-slot";
  auto_retweet_enabled?: boolean;
  auto_plug_enabled?: boolean;
};

export async function createDraft(
  input: CreateDraftInput
): Promise<Result<{ draft: TypefullyDraft }>> {
  if (!apiKey()) return { available: false, reason: "no_api_key" };
  const body: Record<string, unknown> = { content: input.content };
  if (input.threadify) body.threadify = true;
  if (input.share) body.share = true;
  if (input.schedule_date) body.schedule_date = input.schedule_date;
  if (input.auto_retweet_enabled) body.auto_retweet_enabled = true;
  if (input.auto_plug_enabled) body.auto_plug_enabled = true;

  try {
    const draft = await callTypefully<TypefullyDraft>(`/drafts/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { available: true, draft };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

export async function listRecentlyScheduled(): Promise<
  Result<{ drafts: TypefullyDraft[] }>
> {
  if (!apiKey()) return { available: false, reason: "no_api_key" };
  try {
    const drafts = await callTypefully<TypefullyDraft[]>(
      `/drafts/recently-scheduled/`
    );
    return { available: true, drafts: drafts || [] };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

export async function listRecentlyPublished(): Promise<
  Result<{ drafts: TypefullyDraft[] }>
> {
  if (!apiKey()) return { available: false, reason: "no_api_key" };
  try {
    const drafts = await callTypefully<TypefullyDraft[]>(
      `/drafts/recently-published/`
    );
    return { available: true, drafts: drafts || [] };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}
