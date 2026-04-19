"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEYS = {
  aiSidebar: "tqg.ai_sidebar_open",
  contextPanel: "tqg.context_panel_open",
} as const;

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function useToggle(
  key: string,
  defaultValue: boolean
): readonly [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readBool(key, defaultValue),
    () => defaultValue
  );

  const setValue = useCallback(
    (next: boolean) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // storage quota / disabled; continue so the event still fires
      }
      // storage event normally only fires cross-tab. Dispatch manually so
      // subscribers in this tab stay in sync.
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: String(next) })
      );
    },
    [key]
  );

  return [value, setValue] as const;
}

export function useAiSidebarOpen() {
  return useToggle(STORAGE_KEYS.aiSidebar, true);
}

export function useContextPanelOpen() {
  return useToggle(STORAGE_KEYS.contextPanel, false);
}
