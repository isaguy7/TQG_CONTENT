import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","by","for","with",
  "is","are","was","were","be","been","being","it","its","this","that","these",
  "those","as","from","into","over","about","than","then","so","such","if","not",
  "no","yes","do","does","did","have","has","had","will","would","could","should",
  "may","might","can","i","you","he","she","they","we","them","us","his","her",
  "our","your","their","my","me","him","there","here","up","down","out","off",
  "only","just","also","more","most","some","any","all","each","every","other",
  "what","which","who","whom","whose","when","where","why","how","get","got",
  "like","one","two","three","said","say","says","say's","very","much","many",
  "people","time","day","year","years","today","tomorrow","yesterday",
]);

function extractKeywords(text: string, max = 6): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ");
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length < 4) continue;
    if (STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

export async function POST(req: NextRequest) {
  let body: { content?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = (body.content || "").trim();
  const limit = Math.max(1, Math.min(10, body.limit || 5));

  if (content.length < 30) {
    return NextResponse.json({ suggestions: [], keywords: [] });
  }

  const keywords = extractKeywords(content, 6);
  if (keywords.length === 0) {
    return NextResponse.json({ suggestions: [], keywords: [] });
  }

  const query = keywords.slice(0, 4).join(" ");
  const db = getSupabaseServer();

  const fts = await db
    .from("hadith_corpus")
    .select(
      "id,collection,collection_name,hadith_number,english_text,narrator,grade,sunnah_com_url,in_book_reference"
    )
    .textSearch("english_text", query, { type: "websearch", config: "english" })
    .limit(limit);

  if (fts.error) {
    return NextResponse.json({ error: fts.error.message }, { status: 500 });
  }

  return NextResponse.json({
    keywords,
    query,
    suggestions: fts.data || [],
  });
}
