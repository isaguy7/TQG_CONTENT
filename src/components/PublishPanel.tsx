"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TypefullyPush } from "@/components/TypefullyPush";

type Platform = "linkedin" | "x";

type Connection = {
  id: string;
  platform: string;
  account_type: "personal" | "organization";
  account_name: string | null;
  account_id: string;
  status: "active" | "expired" | "revoked";
  token_expires_at: string | null;
  scopes: string[] | null;
  avatar_url: string | null;
  connected_at: string;
};

type ConvertedVariant = { platform: Platform; content: string };

type Schedule = "now" | "custom";

type PublishResult = {
  scheduled: boolean;
  scheduled_for?: string;
  results: Array<{
    platform: Platform;
    success: boolean;
    postId?: string | null;
    permalink?: string | null;
    error?: string;
    needsReauth?: boolean;
  }>;
};

const PLATFORM_LABEL: Record<Platform, string> = {
  linkedin: "LinkedIn",
  x: "X",
};

const PLATFORM_ACCENT: Record<Platform, string> = {
  linkedin: "bg-[#0A66C2]",
  x: "bg-white",
};

function defaultDateTimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000); // +1h
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublishPanel({
  postId,
  content,
  platform,
  imageUrl,
  onPublished,
}: {
  postId: string;
  content: string;
  platform: string;
  imageUrl?: string | null;
  onPublished?: () => void;
}) {
  const [conns, setConns] = useState<Connection[] | null>(null);
  const [enabled, setEnabled] = useState<Record<Platform, boolean>>({
    linkedin: true,
    x: false,
  });
  // Which LinkedIn author to post as — the connection row id. Null = post
  // as personal (the default). For orgs, stores the connection row id so
  // we can look up account_id (the org URN number) at publish time.
  const [linkedinAuthorConnId, setLinkedinAuthorConnId] = useState<string | null>(
    null
  );
  const [variants, setVariants] = useState<ConvertedVariant[]>([
    { platform: "linkedin", content },
    { platform: "x", content },
  ]);
  const [schedule, setSchedule] = useState<Schedule>("now");
  const [customDate, setCustomDate] = useState<string>(defaultDateTimeLocal());
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/connections", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((j) => setConns(j.connections || []))
      .catch(() => setConns([]));
  }, []);

  // Re-sync the LinkedIn variant whenever the editor content changes — we
  // treat the editor body as the LinkedIn source of truth.
  useEffect(() => {
    setVariants((prev) =>
      prev.map((v) =>
        v.platform === "linkedin" ? { platform: "linkedin", content } : v
      )
    );
  }, [content]);

  // The publish panel shows ONE row per platform — pick the personal
  // connection as the representative ("are we connected at all?"). Org
  // rows appear as extra options in the LinkedIn author dropdown below.
  const connByPlatform = useMemo(() => {
    const map: Partial<Record<Platform, Connection>> = {};
    for (const c of conns || []) {
      if (
        (c.platform === "linkedin" || c.platform === "x") &&
        c.account_type === "personal"
      ) {
        map[c.platform] = c;
      }
    }
    return map;
  }, [conns]);

  const linkedinAuthors = useMemo(() => {
    return (conns || []).filter(
      (c) => c.platform === "linkedin" && c.status === "active"
    );
  }, [conns]);

  // Default the author dropdown to the personal connection whenever the
  // set of LinkedIn connections changes.
  useEffect(() => {
    if (linkedinAuthors.length === 0) {
      setLinkedinAuthorConnId(null);
      return;
    }
    setLinkedinAuthorConnId((prev) => {
      if (prev && linkedinAuthors.some((c) => c.id === prev)) return prev;
      const personal = linkedinAuthors.find((c) => c.account_type === "personal");
      return (personal || linkedinAuthors[0]).id;
    });
  }, [linkedinAuthors]);

  // Auto-enable LinkedIn if connected, leave X off by default unless connected.
  useEffect(() => {
    if (!conns) return;
    setEnabled((prev) => ({
      linkedin: prev.linkedin && !!connByPlatform.linkedin,
      x: prev.x && !!connByPlatform.x,
    }));
  }, [conns, connByPlatform]);

  const generateXVariant = async () => {
    setConverting(true);
    try {
      const res = await fetch("/api/claude/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          from_platform: "linkedin",
          to_platform: "x",
          post_id: postId,
        }),
      });
      const j = await res.json();
      if (j.available && j.converted) {
        setVariants((prev) =>
          prev.map((v) =>
            v.platform === "x" ? { platform: "x", content: j.converted } : v
          )
        );
      }
    } catch {
      // ignore — keep existing variant
    } finally {
      setConverting(false);
    }
  };

  const variantFor = (p: Platform) =>
    variants.find((v) => v.platform === p)?.content ?? content;

  const setVariantFor = (p: Platform, value: string) => {
    setVariants((prev) =>
      prev.map((v) => (v.platform === p ? { platform: p, content: value } : v))
    );
  };

  const publish = async () => {
    const selectedLinkedinAuthor = linkedinAuthors.find(
      (c) => c.id === linkedinAuthorConnId
    );
    const items = (Object.keys(enabled) as Platform[])
      .filter((p) => enabled[p])
      .map((p) => ({
        platform: p,
        content: variantFor(p),
        image_url: imageUrl || null,
        // LinkedIn gets an extra field when the user picks a Page — the
        // numeric org id is what ends up in `urn:li:organization:{id}`.
        ...(p === "linkedin" &&
        selectedLinkedinAuthor?.account_type === "organization"
          ? { as_organization: selectedLinkedinAuthor.account_id }
          : {}),
      }));
    if (items.length === 0) {
      setError("Pick at least one platform.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          items,
          schedule_at:
            schedule === "custom" && customDate
              ? new Date(customDate).toISOString()
              : null,
        }),
      });
      const j: PublishResult = await res.json();
      setResult(j);
      if (
        (j.scheduled || j.results?.some((r) => r.success)) &&
        onPublished
      ) {
        onPublished();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const platformsToShow: Platform[] = ["linkedin", "x"];
  const anyConnected = !!(connByPlatform.linkedin || connByPlatform.x);

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="section-label">Publish</span>
        <span className="text-[11px] text-white/40">
          Direct posting via your connected accounts
        </span>
      </div>

      {!anyConnected ? (
        <div className="rounded-md bg-amber-500/10 border border-amber-400/30 p-3 text-[12px] text-amber-100/90 leading-relaxed">
          No social accounts connected. Sign in with LinkedIn or X from the{" "}
          <a
            className="underline underline-offset-2 hover:text-amber-50"
            href="/login"
          >
            login page
          </a>{" "}
          to enable direct posting.
        </div>
      ) : null}

      <div className="space-y-3">
        {platformsToShow.map((p) => {
          const conn = connByPlatform[p];
          const isOn = enabled[p];
          const expired = conn?.status === "expired";
          return (
            <div
              key={p}
              className={cn(
                "rounded-md border p-3 space-y-2",
                conn && !expired
                  ? "border-white/[0.08] bg-white/[0.02]"
                  : "border-white/[0.05] bg-black/20"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn("w-2 h-2 rounded-full", PLATFORM_ACCENT[p])}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-white/85">
                    {PLATFORM_LABEL[p]}
                  </div>
                  <div className="text-[11px] text-white/45 truncate">
                    {conn
                      ? expired
                        ? "Token expired — sign in again"
                        : p === "linkedin" && linkedinAuthors.length > 1
                          ? `${linkedinAuthors.length} LinkedIn authors available`
                          : `Connected as ${conn.account_name || conn.account_id}`
                      : "Not connected"}
                  </div>
                </div>
                {conn && !expired ? (
                  <label className="flex items-center gap-2 text-[11px] text-white/60">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={(e) =>
                        setEnabled((prev) => ({
                          ...prev,
                          [p]: e.target.checked,
                        }))
                      }
                    />
                    Enable
                  </label>
                ) : (
                  <a
                    href="/login"
                    className="px-2 py-1 rounded text-[11px] border border-white/[0.1] text-white/70 hover:text-white hover:bg-white/[0.04]"
                  >
                    {expired ? "Reconnect" : `Connect ${PLATFORM_LABEL[p]}`}
                  </a>
                )}
              </div>

              {isOn && conn && !expired && p === "linkedin" && linkedinAuthors.length > 1 ? (
                <label className="flex items-center gap-2 text-[11px] text-white/60">
                  <span className="text-white/45">Post as</span>
                  <select
                    value={linkedinAuthorConnId ?? ""}
                    onChange={(e) => setLinkedinAuthorConnId(e.target.value)}
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
                  >
                    {linkedinAuthors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_name || a.account_id}
                        {a.account_type === "organization"
                          ? " (page)"
                          : " (personal)"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {isOn && conn && !expired ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      Preview
                    </span>
                    {p === "x" ? (
                      <button
                        type="button"
                        onClick={generateXVariant}
                        disabled={converting}
                        className="text-[10px] text-white/50 hover:text-white/85 underline-offset-2 hover:underline disabled:opacity-40"
                      >
                        {converting ? "Converting…" : "Re-convert with Claude"}
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    value={variantFor(p)}
                    onChange={(e) => setVariantFor(p, e.target.value)}
                    rows={p === "x" ? 3 : 5}
                    className="w-full bg-black/30 border border-white/[0.06] rounded p-2 text-[12px] text-white/85 font-mono leading-relaxed focus:outline-none focus:border-white/[0.18]"
                  />
                  {p === "x" ? (
                    <div
                      className={cn(
                        "text-[10px] text-right",
                        variantFor("x").length > 280
                          ? "text-danger"
                          : "text-white/35"
                      )}
                    >
                      {variantFor("x").length} / 280
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-2">
          <span className="text-white/50">When:</span>
          <select
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as Schedule)}
            className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
          >
            <option value="now">Publish now</option>
            <option value="custom">Schedule for…</option>
          </select>
        </label>
        {schedule === "custom" ? (
          <input
            type="datetime-local"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
          />
        ) : null}
        <div className="flex-1" />
        <button
          onClick={publish}
          disabled={busy || !anyConnected}
          className="px-4 py-1.5 rounded text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {busy
            ? "Publishing…"
            : schedule === "custom"
              ? "Schedule"
              : "Publish now"}
        </button>
      </div>

      {error ? (
        <div className="text-[12px] text-danger">{error}</div>
      ) : null}

      {result ? (
        <ul className="space-y-1 pt-1">
          {result.scheduled ? (
            <li className="rounded p-2 text-[12px] bg-emerald-500/[0.06] border border-emerald-400/20 text-emerald-200">
              Scheduled for{" "}
              {new Date(result.scheduled_for!).toLocaleString()} on{" "}
              {result.results.map((r) => PLATFORM_LABEL[r.platform]).join(", ")}.
            </li>
          ) : (
            result.results.map((r, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-center justify-between gap-3 p-2 rounded text-[12px] border",
                  r.success
                    ? "bg-emerald-500/[0.06] border-emerald-400/20"
                    : "bg-danger/[0.06] border-danger/20"
                )}
              >
                <span className="font-medium text-white/80 uppercase tracking-wider text-[10px]">
                  {PLATFORM_LABEL[r.platform]}
                </span>
                <span className="flex-1 truncate text-white/70">
                  {r.success ? r.permalink || `Posted #${r.postId}` : r.error}
                </span>
                {r.permalink ? (
                  <a
                    href={r.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline underline-offset-2 text-white/70 hover:text-white"
                  >
                    Open
                  </a>
                ) : null}
                {r.needsReauth ? (
                  <a
                    href="/login"
                    className="text-[11px] underline underline-offset-2 text-amber-200 hover:text-amber-100"
                  >
                    Reconnect
                  </a>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {/* Fallback: if Typefully is configured server-side, keep it as a
          secondary option for any platform that isn't connected directly. */}
      <details className="pt-2 border-t border-white/[0.05]">
        <summary className="text-[11px] text-white/40 cursor-pointer hover:text-white/70">
          Advanced — push via Typefully (fallback)
        </summary>
        <div className="mt-2">
          <TypefullyPush
            postId={postId}
            content={content}
            platform={platform}
            imageUrl={imageUrl}
            onScheduled={onPublished}
          />
        </div>
      </details>
    </section>
  );
}
