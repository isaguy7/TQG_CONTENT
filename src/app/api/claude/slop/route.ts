import { NextRequest, NextResponse } from "next/server";
import { checkSlop } from "@/lib/claude-api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: { content?: string; post_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Missing 'content'" }, { status: 400 });
  }
  try {
    const result = await checkSlop({
      content: body.content,
      postId: body.post_id || null,
      userId: auth.user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { available: false, reason: (err as Error).message },
      { status: 500 }
    );
  }
}
