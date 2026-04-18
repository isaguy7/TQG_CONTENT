"use client";

import { useEffect, useState } from "react";

type SyncResult = {
  available: boolean;
  created?: number;
  updated?: number;
  skipped?: number;
  published_fetched?: number;
  scheduled_fetched?: number;
  reason?: string;
};

export function TypefullySyncButton({
  onDone,
  compact,
}: {
  onDone?: () => void;
  compact?: boolean;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/typefully/status")
      .then((r) => r.json())
      .then((j) => setAvailable(Boolean(j.available)))
      .catch(() => setAvailable(false));
  }, []);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/typefully/sync", { method: "POST" });
      const j: SyncResult = await res.json();
      if (!j.available) {
        setMessage(`Not available: ${j.reason || "set TYPEFULLY_API_KEY"}`);
        return;
      }
      setMessage(
        `${j.created || 0} new · ${j.updated || 0} updated · ${
          j.published_fetched || 0
        } published, ${j.scheduled_fetched || 0} scheduled fetched`
      );
      onDone?.();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  if (available === null) return null;
  if (!available) return null;

  const size = compact
    ? "px-2 py-1 text-[11px]"
    : "px-3 py-1.5 text-[12px]";

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className={`${size} rounded border border-white/[0.08] text-white/85 hover:text-white hover:bg-white/[0.04] disabled:opacity-40`}
      >
        {busy ? "Syncing…" : "Sync from Typefully"}
      </button>
      {message ? (
        <span className="text-[11px] text-white/60">{message}</span>
      ) : null}
    </div>
  );
}
