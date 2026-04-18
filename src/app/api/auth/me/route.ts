import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      provider: user.app_metadata?.provider ?? null,
      full_name:
        (meta.full_name as string | undefined) ||
        (meta.name as string | undefined) ||
        user.email ||
        null,
      avatar_url:
        (meta.avatar_url as string | undefined) ||
        (meta.picture as string | undefined) ||
        null,
    },
  });
}
