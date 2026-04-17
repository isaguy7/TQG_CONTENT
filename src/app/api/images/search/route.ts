import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnsplashPhoto = {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
};

function apiKey(): string | null {
  const v = process.env.UNSPLASH_ACCESS_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const perPageRaw = Number(req.nextUrl.searchParams.get("per_page") ?? "12");
  const perPage = Number.isFinite(perPageRaw)
    ? Math.max(1, Math.min(30, Math.trunc(perPageRaw)))
    : 12;

  const key = apiKey();
  if (!key) {
    return NextResponse.json({ available: false, results: [] });
  }
  if (!q) {
    return NextResponse.json({ available: true, results: [] });
  }

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", q);
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { available: true, error: `Unsplash ${res.status}: ${body.slice(0, 300)}` },
      { status: 502 }
    );
  }
  const json = (await res.json()) as { results: UnsplashPhoto[] };
  const results = (json.results || []).map((p) => ({
    id: p.id,
    alt: p.alt_description || p.description || "",
    urls: { regular: p.urls.regular, small: p.urls.small, thumb: p.urls.thumb },
    link: p.links.html,
    photographer: p.user.name,
    photographer_url: p.user.links.html,
  }));
  return NextResponse.json({ available: true, results });
}
