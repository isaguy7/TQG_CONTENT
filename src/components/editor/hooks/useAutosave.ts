"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { EditorVariant } from "../PlatformVariantTabs";

export interface SavePayload {
  variant: EditorVariant;
  text: string;
  html: string;
  json: JSONContent;
}

export interface AutosaveState {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: Date | null;
  error: Error | null;
}

type SavedPostResponse = {
  post?: {
    platform_versions?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
};

export interface UseAutosaveOptions {
  postId: string;
  debounceMs?: number;
  /** Pause all save activity. Used during post reload to prevent saves
   *  against stale client state. */
  enabled?: boolean;
  /** Called with the server's post response after a successful save.
   *  Lets the parent re-seed derived state (e.g. variant-differs set). */
  onServerUpdate?: (post: NonNullable<SavedPostResponse["post"]>) => void;
}

export interface UseAutosaveReturn {
  state: AutosaveState;
  /** Debounced — resets the timer on each call. Payload overwrites prior
   *  pending one; only the latest is ever sent. */
  triggerSave: (payload: SavePayload) => void;
  /** Cancels the debounce timer and fires the save immediately. Resolves
   *  once the save completes (or rejects on error). Safe no-op when no
   *  payload is pending. */
  flushSave: () => Promise<void>;
  /** Clears the debounce timer without saving. Use when switching
   *  variants so the outgoing payload doesn't land after a variant swap. */
  cancelPending: () => void;
}

type MutexState = "idle" | "saving";

/**
 * Autosave hook for the Tiptap post editor. Debounces rapid keystrokes,
 * prevents overlapping HTTP saves via a mutex, queues the latest payload
 * while a save is in-flight, and surfaces status to a UI indicator.
 *
 * Single instance per editor regardless of how many variants are in
 * play — `variant` lives on the payload so the active variant can change
 * between saves without needing a new hook instance. State (status,
 * lastSavedAt, error) applies to the most recent save of any variant.
 */
export function useAutosave({
  postId,
  debounceMs = 3000,
  enabled = true,
  onServerUpdate,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [state, setState] = useState<AutosaveState>({
    status: "idle",
    lastSavedAt: null,
    error: null,
  });

  // Refs hold mutable pieces that must stay outside React's render cycle.
  const mutexRef = useRef<MutexState>("idle");
  const queuedPayloadRef = useRef<SavePayload | null>(null);
  const pendingPayloadRef = useRef<SavePayload | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const onServerUpdateRef = useRef(onServerUpdate);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    onServerUpdateRef.current = onServerUpdate;
  }, [onServerUpdate]);

  const dispatchSave = useCallback(
    async (payload: SavePayload): Promise<void> => {
      if (!enabledRef.current) return;

      // Mutex: if a save is already running, queue the latest payload
      // and let the in-flight completion handler pick it up.
      if (mutexRef.current === "saving") {
        queuedPayloadRef.current = payload;
        return;
      }

      mutexRef.current = "saving";
      setState((prev) => ({ ...prev, status: "saving", error: null }));

      try {
        const body =
          payload.variant === "canonical"
            ? {
                final_content: payload.text,
                content_html: payload.html,
                content_json: payload.json,
              }
            : {
                // Variant save — parent routes into platform_versions;
                // the page-level caller assembles the full map before
                // passing payload here. See PostEditor integration.
                platform_versions: {
                  [payload.variant]: {
                    final_content: payload.text,
                    content_html: payload.html,
                    content_json: payload.json,
                  },
                },
              };

        const res = await fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const msg = await res
            .json()
            .catch(() => ({}))
            .then((j) => (j as { error?: string }).error ?? `HTTP ${res.status}`);
          throw new Error(msg);
        }
        const json = (await res.json()) as SavedPostResponse;
        if (json.post) onServerUpdateRef.current?.(json.post);

        setState({
          status: "saved",
          lastSavedAt: new Date(),
          error: null,
        });
      } catch (err) {
        setState({
          status: "error",
          lastSavedAt: null,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      } finally {
        mutexRef.current = "idle";
        // Fire the queued payload (if any) without re-debouncing — the
        // user was waiting on it during our last save; don't re-delay.
        const queued = queuedPayloadRef.current;
        queuedPayloadRef.current = null;
        if (queued) {
          void dispatchSave(queued);
        }
      }
    },
    [postId]
  );

  const triggerSave = useCallback(
    (payload: SavePayload) => {
      pendingPayloadRef.current = payload;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const p = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        if (p) void dispatchSave(p);
      }, debounceMs);
    },
    [debounceMs, dispatchSave]
  );

  const flushSave = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const p = pendingPayloadRef.current;
    pendingPayloadRef.current = null;
    if (!p) return;
    await dispatchSave(p);
  }, [dispatchSave]);

  const cancelPending = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingPayloadRef.current = null;
  }, []);

  // Clean up the debounce timer on unmount (but don't flush — the user
  // may be navigating intentionally, and a stale payload shouldn't land).
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { state, triggerSave, flushSave, cancelPending };
}
