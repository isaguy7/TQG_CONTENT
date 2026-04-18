"use client";

import { useEffect, useRef } from "react";

/**
 * Silent, fire-and-forget Typefully sync triggered on mount. No UI, no toast.
 * A shared in-memory flag plus a short sessionStorage TTL prevents duplicate
 * calls when several pages mount in the same session.
 */
const SESSION_KEY = "typefully_last_sync_at";
const TTL_MS = 60_000; // re-sync at most once a minute per tab

let inFlight: Promise<void> | null = null;

function shouldSync(): boolean {
  if (inFlight) return false;
  try {
    const prev = Number(sessionStorage.getItem(SESSION_KEY) || "0");
    if (prev && Date.now() - prev < TTL_MS) return false;
  } catch {}
  return true;
}

function markSynced() {
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now()));
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
