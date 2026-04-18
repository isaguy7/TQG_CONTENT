"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type LinkedInPage = {
  organization_id: string;
  name: string;
  vanity_name: string | null;
  urn: string;
  connected: boolean;
  connection_id?: string;
};

type Props = {
  /**
   * When false, the component renders a dimmed "sign in first" notice.
   */
  linkedinConnected: boolean;
};

export function LinkedInPages({ linkedinConnected }: Props) {
  const [pages, setPages] = useState<LinkedInPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!linkedinConnected) {
      setPages(null);
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/auth/linkedin-pages", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || `HTTP ${res.status}`);
        setPages([]);
        return;
      }
      const body = (await res.json()) as { pages: LinkedInPage[] };
      setPages(body.pages || []);
    } catch (err) {
      setError((err as Error).message);
      setPages([]);
    }
  }, [linkedinConnected]);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async (page: LinkedInPage) => {
    setBusyOrgId(page.organization_id);
    setError(null);
    try {
      const res = await fetch("/api/auth/linkedin-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: page.organization_id,
          name: page.name,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || `HTTP ${res.status}`);
      } else {
        await load();
      }
    } finally {
      setBusyOrgId(null);
    }
  };

  const disconnect = async (page: LinkedInPage) => {
    if (!page.connection_id) return;
    setBusyOrgId(page.organization_id);
    try {
      await fetch(
        `/api/auth/connections?id=${encodeURIComponent(page.connection_id)}`,
        { method: "DELETE" }
      );
      await load();
    } finally {
      setBusyOrgId(null);
    }
  };

  if (!linkedinConnected) {
    return (
      <div className="text-[11px] text-white/40">
        Sign in with LinkedIn first, then come back to pick a Page.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">
          LinkedIn Pages you administer
        </span>
        <button
          onClick={load}
          className="text-[11px] text-white/40 hover:text-white/80 underline underline-offset-2"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100/90">
          {error}
        </div>
      ) : null}
      {pages === null ? (
        <div className="text-[11px] text-white/40">Loading pages…</div>
      ) : pages.length === 0 ? (
        <div className="text-[11px] text-white/40">
          No LinkedIn Pages found for this account. Only Page admins can post
          as the Page — ask the Page owner to add your LinkedIn as an admin.
        </div>
      ) : (
        <ul className="space-y-1">
          {pages.map((p) => (
            <li
              key={p.organization_id}
              className={cn(
                "flex items-center gap-3 p-2 rounded border",
                p.connected
                  ? "border-emerald-400/25 bg-emerald-500/[0.04]"
                  : "border-white/[0.06] bg-white/[0.02]"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  p.connected ? "bg-emerald-400" : "bg-white/25"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-white/85 truncate">
                  {p.name}
                </div>
                <div className="text-[10px] text-white/45 font-mono truncate">
                  {p.urn}
                  {p.vanity_name ? ` · @${p.vanity_name}` : ""}
                </div>
              </div>
              {p.connected ? (
                <button
                  onClick={() => disconnect(p)}
                  disabled={busyOrgId === p.organization_id}
                  className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
                >
                  {busyOrgId === p.organization_id ? "…" : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={() => connect(p)}
                  disabled={busyOrgId === p.organization_id}
                  className="px-2 py-1 rounded text-[11px] bg-[#0A66C2] text-white hover:bg-[#004182] disabled:opacity-40"
                >
                  {busyOrgId === p.organization_id ? "…" : "Use this Page"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
