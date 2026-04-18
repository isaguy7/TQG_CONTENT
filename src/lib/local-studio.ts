/**
 * Client-only helpers for the "Local Studio URL" setting. Stored in
 * localStorage so it stays per-browser — there's no point syncing it
 * via the DB because the whole URL is only meaningful from the user's
 * own network.
 */

const KEY = "tqg_local_studio_url";

export function getLocalStudioUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  return raw ? raw.replace(/\/$/, "") : null;
}

export function setLocalStudioUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, url.replace(/\/$/, ""));
}

export function clearLocalStudioUrl(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/**
 * Build a URL on the user's Local Studio by pasting the current path
 * (and an optional query string) onto the stored base. Returns null
 * when no Local Studio is configured.
 */
export function localStudioLink(
  pathname: string,
  search?: string | Record<string, string>
): string | null {
  const base = getLocalStudioUrl();
  if (!base) return null;
  let qs = "";
  if (typeof search === "string") {
    qs = search.startsWith("?") ? search : `?${search}`;
  } else if (search && typeof search === "object") {
    const params = new URLSearchParams(search);
    const str = params.toString();
    qs = str ? `?${str}` : "";
  }
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}${qs}`;
}
