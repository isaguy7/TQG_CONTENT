import { NextRequest, NextResponse } from "next/server";
import { convertPlatform } from "@/lib/claude-api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: {
    content?: string;
    from_platform?: string;
    to_platform?: string;
    post_id?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Missing 'content'" }, { status: 400 });
  }
  if (!body.from_platform || !body.to_platform) {
    return NextResponse.json(
      { error: "Missing from_platform or to_platform" },
      { status: 400 }
    );
  }
  try {
    const result = await convertPlatform({
      content: body.content,
      fromPlatform: body.from_platform,
      toPlatform: body.to_platform,
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
