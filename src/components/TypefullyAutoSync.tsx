"use client";

import { useEffect, useRef } from "react";

/**
 * Silent, fire-and-forget Typefully sync triggered on mount. No UI, no toast.
 * A shared in-memory flag plus a short sessionStorage TTL prevents duplicate
 * calls when several pages mount in the same session.
 */
const SESSION_KEY = "typefully_last_sync_at";
const TTL_MS = 10 * 60 * 1000; // re-sync at most once every 10 minutes per tab

let inFlight: Promise<void> | null = null;

function lastSyncAt(): number {
  try {
    const local = Number(localStorage.getItem(SESSION_KEY) || "0");
    if (local) return local;
  } catch {}
  try {
    return Number(sessionStorage.getItem(SESSION_KEY) || "0");
  } catch {}
  return 0;
}

function shouldSync(): boolean {
  if (inFlight) return false;
  const prev = lastSyncAt();
  if (prev && Date.now() - prev < TTL_MS) return false;
  return true;
}

function markSynced() {
  const now = String(Date.now());
  try {
    localStorage.setItem(SESSION_KEY, now);
  } catch {}
  try {
    sessionStorage.setItem(SESSION_KEY, now);
  } catch {}
}

export function TypefullyAutoSync({ onDone }: { onDone?: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!shouldSync()) {
      onDoneRef.current?.();
      return;
    }
    inFlight = (async () => {
      try {
        const res = await fetch("/api/typefully/sync", { method: "POST" });
        if (res.ok) markSynced();
      } catch {
        // Silent — sync is best-effort background.
      } finally {
        inFlight = null;
        onDoneRef.current?.();
      }
    })();
  }, []);

  return null;
}
