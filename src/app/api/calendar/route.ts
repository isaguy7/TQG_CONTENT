import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentWeek, computeGapAlerts } from "@/lib/gap-alerts";
import { getSupabaseServer } from "@/lib/supabase";
import {
  listRecentlyScheduled,
  typefullyAvailable,
  type TypefullyDraft,
} from "@/lib/typefully";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtendedDraft = TypefullyDraft & {
  content?: string;
  text?: string;
  platform?: string;
  social_network?: string;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const monthParam = sp.get("month"); // format: YYYY-MM; default = current month

  const calendar = await ensureCurrentWeek();
  const alerts = await computeGapAlerts();

  const db = getSupabaseServer();

  // Compute the month window. Default to the current month so existing
  // callers (no ?month=) keep working, now returning the whole month.
  const today = new Date();
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]) - 1;
    }
  }
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1));

  const { data: posts } = await db
    .from("posts")
    .select(
      "id,title,platform,status,scheduled_for,published_at,figure_id,labels,performance"
    )
    .is("deleted_at", null)
    .or(
      `and(status.eq.published,published_at.gte.${monthStart.toISOString()},published_at.lt.${monthEnd.toISOString()}),and(status.in.(scheduled,ready,drafting,idea,review),scheduled_for.gte.${monthStart.toISOString()},scheduled_for.lt.${monthEnd.toISOString()})`
    )
    .order("scheduled_for", { ascending: true });

  const postsList = posts || [];

  // Collect Typefully draft IDs already tied to local posts so we don't
  // render them twice when pulling scheduled Typefully drafts.
  const linkedDraftIds = new Set<string>();
  for (const p of postsList) {
    const perf = p.performance as Record<string, unknown> | null;
    const ids = Array.isArray(perf?.typefully_draft_ids)
      ? (perf!.typefully_draft_ids as Array<string | number>)
      : [];
    for (const id of ids) linkedDraftIds.add(String(id));
  }

  let typefullyDrafts: Array<{
    id: string;
    title: string;
    platform: string;
    scheduled_for: string | null;
    share_url: string | null;
    source: "typefully";
  }> = [];

  if (typefullyAvailable()) {
    const res = await listRecentlyScheduled();
    if (res.available) {
      typefullyDrafts = (res.drafts as ExtendedDraft[])
        .filter((d) => !linkedDraftIds.has(String(d.id)))
        .map((d) => {
          const text = d.content || d.text || "";
          const platform = detectPlatform(d);
          const scheduled = d.scheduled_date || null;
          const title =
            text.split(/\n/, 1)[0].slice(0, 80) || "(Typefully draft)";
          return {
            id: `typefully-${d.id}`,
            title,
            platform,
            scheduled_for: scheduled,
            share_url: d.share_url || null,
            source: "typefully" as const,
          };
        })
        .filter((d) => {
          if (!d.scheduled_for) return false;
          const date = new Date(d.scheduled_for);
          return date >= monthStart && date < monthEnd;
        });
    }
  }

  return NextResponse.json({
    calendar,
    alerts,
    posts: postsList.map((p) => ({
      id: p.id,
      title: p.title,
      platform: p.platform,
      status: p.status,
      scheduled_for: p.scheduled_for,
      published_at: p.published_at,
      figure_id: p.figure_id,
      labels: p.labels,
      source: "local" as const,
    })),
    typefully_drafts: typefullyDrafts,
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
  });
}

function detectPlatform(draft: ExtendedDraft): string {
  const raw = (draft.platform || draft.social_network || "")
    .toString()
    .toLowerCase();
  if (raw.includes("linkedin")) return "linkedin";
  if (raw.includes("twitter") || raw.includes("x")) return "x";
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("facebook")) return "facebook";
  return "x";
}
