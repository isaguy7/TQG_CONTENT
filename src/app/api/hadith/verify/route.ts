import { NextRequest, NextResponse } from "next/server";
import { verifySunnahUrl, enrichFromUrl } from "@/lib/sunnah-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Check a sunnah.com URL resolves (HTTP 200) and optionally extract
 * narrator/arabic/translation metadata. NOTE: this does NOT mark the
 * hadith as verified in the DB — that remains a manual human decision.
 * It only confirms the URL is reachable and surfaces page content so
 * the reviewer can quickly read it.
 */
export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "Missing 'url'" }, { status: 400 });
  }

  const check = await verifySunnahUrl(url, req.signal);
  if (!check.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: check.status,
        error:
          check.status === 0
            ? "Could not reach sunnah.com — check URL and network"
            : `sunnah.com returned ${check.status} for that URL`,
      },
      { status: 422 }
    );
  }

  const enriched = await enrichFromUrl(check.canonical || url, req.signal);
  return NextResponse.json({
    ok: true,
    status: check.status,
    canonical: check.canonical,
    enriched,
  });
}
