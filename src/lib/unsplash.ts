const MAX_PER_PAGE = 30;

export type UnsplashResult = {
  id: string;
  alt: string;
  urls: { regular: string; small: string; thumb: string };
  link: string;
  photographer: string;
  photographer_url: string;
};

export type UnsplashSearchResponse = {
  available: boolean;
  results?: UnsplashResult[];
  error?: string;
};

function apiKey(): string | null {
  const v = process.env.UNSPLASH_ACCESS_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

export async function searchUnsplash(
  query: string,
  perPage: number = 12
): Promise<UnsplashSearchResponse> {
  const key = apiKey();
  if (!key) return { available: false, results: [] };

  const q = query.trim();
  if (!q) return { available: true, results: [] };

  const per = Math.max(1, Math.min(MAX_PER_PAGE, Math.trunc(perPage)));
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", q);
  url.searchParams.set("per_page", String(per));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      available: true,
      results: [],
      error: `Unsplash ${res.status}: ${body.slice(0, 300)}`,
    };
  }
  const json = (await res.json()) as {
    results: Array<{
      id: string;
      description: string | null;
      alt_description: string | null;
      urls: { regular: string; small: string; thumb: string };
      links: { html: string; download_location: string };
      user: { name: string; links: { html: string } };
    }>;
  };

  const results = (json.results || []).map((p) => ({
    id: p.id,
    alt: p.alt_description || p.description || "",
    urls: { regular: p.urls.regular, small: p.urls.small, thumb: p.urls.thumb },
    link: p.links.html,
    photographer: p.user.name,
    photographer_url: p.user.links.html,
  }));

  return { available: true, results };
}
