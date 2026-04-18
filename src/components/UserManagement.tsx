"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Role = "pending" | "member" | "admin" | "rejected";

type UserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

type Counts = Record<Role, number>;

type Action = "approve" | "reject" | "promote" | "demote";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Renders only when the caller is an admin — the API route is the real
 * gate. If the user isn't an admin the /api/admin/users request 403s and
 * we render nothing (no noisy error for non-admins).
 */
export function UserManagement() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (res.status === 403 || res.status === 401) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { users: UserRow[]; counts: Counts };
      setUsers(body.users);
      setCounts(body.counts);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (userId: string, action: Action) => {
    setBusyUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || `HTTP ${res.status}`);
      } else {
        await load();
      }
    } finally {
      setBusyUserId(null);
    }
  };

  if (forbidden) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">User management</h2>
          {counts ? (
            <p className="text-[11px] text-white/45 mt-0.5">
              Pending {counts.pending} · Members {counts.member} · Admins{" "}
              {counts.admin}
              {counts.rejected ? ` · Rejected ${counts.rejected}` : ""}
            </p>
          ) : null}
        </div>
        <button
          onClick={load}
          className="text-[11px] text-white/45 hover:text-white/80 underline underline-offset-2"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100/90">
          {error}
        </div>
      ) : null}

      {users === null ? (
        <div className="text-[12px] text-white/45">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="text-[12px] text-white/45">No users yet.</div>
      ) : (
        <ul className="space-y-1">
          {users.map((u) => (
            <UserRowItem
              key={u.user_id}
              user={u}
              busy={busyUserId === u.user_id}
              onAction={(a) => act(u.user_id, a)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const ROLE_TONE: Record<Role, string> = {
  pending: "bg-amber-500/15 text-amber-200 border-amber-400/25",
  member: "bg-white/[0.05] text-white/70 border-white/[0.1]",
  admin: "bg-primary/20 text-primary-bright border-primary/40",
  rejected: "bg-danger/10 text-danger border-danger/30",
};

function UserRowItem({
  user,
  busy,
  onAction,
}: {
  user: UserRow;
  busy: boolean;
  onAction: (a: Action) => void;
}) {
  return (
    <li className="flex items-center gap-3 p-2.5 rounded border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.035] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/90 truncate">
          {user.display_name || user.email || user.user_id}
        </div>
        <div className="text-[11px] text-white/45 flex items-center gap-2 mt-0.5">
          <span className="truncate">{user.email || "no email"}</span>
          <span className="text-white/25">·</span>
          <span>requested {formatRelative(user.created_at)}</span>
        </div>
      </div>
      <span
        className={cn(
          "px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider shrink-0",
          ROLE_TONE[user.role]
        )}
      >
        {user.role}
      </span>
      <div className="flex gap-1 shrink-0">
        {user.role === "pending" || user.role === "rejected" ? (
          <button
            onClick={() => onAction("approve")}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] bg-primary/80 text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            {busy ? "…" : "Approve"}
          </button>
        ) : null}
        {user.role === "pending" || user.role === "member" ? (
          <button
            onClick={() => onAction("reject")}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-danger hover:border-danger/40 disabled:opacity-40"
          >
            Reject
          </button>
        ) : null}
        {user.role === "member" ? (
          <button
            onClick={() => onAction("promote")}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
          >
            Promote
          </button>
        ) : null}
        {user.role === "admin" ? (
          <button
            onClick={() => onAction("demote")}
            disabled={busy}
            className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
          >
            Demote
          </button>
        ) : null}
      </div>
    </li>
  );
}
