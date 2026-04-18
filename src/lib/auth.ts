import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Returns the current authenticated user, or a 401 NextResponse to be
 * returned by the caller. Use the discriminator on `user` to fork:
 *
 *   const auth = await requireUser();
 *   if ("response" in auth) return auth.response;
 *   const user = auth.user;
 */
export async function requireUser(): Promise<
  { user: User } | { response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}
