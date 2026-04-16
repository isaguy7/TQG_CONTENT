import "server-only";

export type SunnahSearchResult = {
  reference: string; // e.g. "Sahih al-Bukhari 3744"
  url: string;
  narrator?: string;
  collection?: string;
  snippet?: string;
};

const UA =
  "Mozilla/5.0 (TQG-Studio local research tool; hadith verification helper)";

const COLLECTION_LABEL: Record<string, string> = {
  bukhari: "Sahih al-Bukhari",
  muslim: "Sahih Muslim",
  nasai: "Sunan an-Nasa'i",
  abudawud: "Sunan Abi Dawud",
  tirmidhi: "Jami` at-Tirmidhi",
  ibnmajah: "Sunan Ibn Majah",
  malik: "Muwatta Malik",
  riyadussalihin: "Riyad as-Salihin",
  adab: "Al-Adab Al-Mufrad",
  bulugh: "Bulugh al-Maram",
  shamail: "Ash-Shama'il Al-Muhammadiyah",
  mishkat: "Mishkat al-Masabih",
  nawawi40: "40 Hadith Nawawi",
  qudsi40: "40 Hadith Qudsi",
  shahwaliullah40: "40 Hadith of Shah Waliullah",
  hisn: "Hisn al-Muslim",
  dhikr: "Fortress of the Muslim",
};

/**
 * Extract a canonical sunnah.com URL from any URL string the user pastes.
 * Returns null if not a sunnah.com link or if it can't be normalized.
 */
export function canonicalizeSunnahUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/(^|\.)sunnah\.com$/i.test(u.hostname)) return null;
    // Strip fragments/queries that aren't part of the hadith identity.
    return `https://sunnah.com${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Parse a sunnah.com URL like /bukhari/2/47 into a human-readable reference.
 * Returns null if the path doesn't match a known collection pattern.
 */
export function referenceFromUrl(url: string): { collection: string; reference: string } | null {
  const canonical = canonicalizeSunnahUrl(url);
  if (!canonical) return null;

  const u = new URL(canonical);
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const slug = parts[0].toLowerCase();
  const label = COLLECTION_LABEL[slug];
  if (!label) return null;

  // Patterns:
  //   /bukhari/2/47       → book 2, hadith 47
  //   /bukhari/5590       → single-number collections
  //   /nawawi40/1         → 40 hadith collection
  //   /muslim:123         → direct reference
  const rest = parts.slice(1);
  let reference = label;

  if (rest.length === 1 && /^\d+$/.test(rest[0])) {
    reference = `${label} ${rest[0]}`;
  } else if (rest.length >= 2 && /^\d+$/.test(rest[0]) && /^\d+$/.test(rest[1])) {
    reference = `${label} ${rest[0]}:${rest[1]}`;
  }

  return { collection: label, reference };
}

/**
 * Best-effort fetch of a sunnah.com page to extract metadata (narrator,
 * Arabic, translation snippet). If parsing fails we still return the
 * reference/url so the user can verify manually.
 */
export async function enrichFromUrl(
  url: string,
  signal?: AbortSignal
): Promise<{ reference: string; url: string; narrator?: string; arabic?: string; translation?: string } | null> {
  const canonical = canonicalizeSunnahUrl(url);
  if (!canonical) return null;

  const parsed = referenceFromUrl(canonical);
  if (!parsed) return null;

  const base = {
    reference: parsed.reference,
    url: canonical,
  } as const;

  try {
    const res = await fetch(canonical, {
      signal,
      headers: { "user-agent": UA },
      redirect: "follow",
    });
    if (!res.ok) return base;
    const html = await res.text();
    const narrator = matchText(
      html,
      /<div[^>]+class="[^"]*hadith_narrated[^"]*"[^>]*>([^<]+)<\/div>/i
    );
    const arabic = matchText(
      html,
      /<div[^>]+class="[^"]*arabic_hadith_full[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    const translation = matchText(
      html,
      /<div[^>]+class="[^"]*english_hadith_full[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    return {
      ...base,
      narrator: narrator || undefined,
      arabic: arabic || undefined,
      translation: translation || undefined,
    };
  } catch {
    return base;
  }
}

function matchText(html: string, re: RegExp): string | null {
  const m = html.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;
}

/**
 * Search sunnah.com via its public search page. Best-effort HTML scrape;
 * returns empty array if the DOM shape has changed. Users can always paste
 * a URL directly instead.
 */
export async function searchSunnah(
  query: string,
  signal?: AbortSignal,
  limit = 10
): Promise<SunnahSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://sunnah.com/search?q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      signal,
      headers: { "user-agent": UA },
      redirect: "follow",
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseSearchResults(html).slice(0, limit);
  } catch {
    return [];
  }
}

function parseSearchResults(html: string): SunnahSearchResult[] {
  const results: SunnahSearchResult[] = [];
  const seen = new Set<string>();

  // sunnah.com search result links follow /{collection}/{book}/{num}
  // or /{collection}/{num}. Extract each unique path.
  const linkRe = /href="(\/(?:bukhari|muslim|nasai|abudawud|tirmidhi|ibnmajah|malik|riyadussalihin|adab|bulugh|shamail|mishkat|nawawi40|qudsi40|shahwaliullah40|hisn|dhikr)\/[^"#?]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const url = `https://sunnah.com${path}`;
    const parsed = referenceFromUrl(url);
    if (!parsed) continue;
    results.push({
      reference: parsed.reference,
      url,
      collection: parsed.collection,
    });
  }
  return results;
}

/**
 * Verify a sunnah.com URL returns HTTP 200.
 */
export async function verifySunnahUrl(
  url: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number; canonical?: string }> {
  const canonical = canonicalizeSunnahUrl(url);
  if (!canonical) return { ok: false, status: 0 };
  try {
    const res = await fetch(canonical, {
      signal,
      headers: { "user-agent": UA },
      redirect: "follow",
      method: "GET",
    });
    return { ok: res.ok, status: res.status, canonical };
  } catch {
    return { ok: false, status: 0, canonical };
  }
}
