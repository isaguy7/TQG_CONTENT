import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Session-aware Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes the auth cookies set by `@supabase/ssr` so
 * that requests run with the signed-in user's RLS context.
 *
 * For privileged admin queries (e.g. shared corpus seeded by service role)
 * keep using `getSupabaseServer()` from `@/lib/supabase`.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll is a no-op when called from a Server Component — that's
          // fine; the middleware will refresh the session on the next request.
        }
      },
    },
  });
}

/**
 * Returns the current authenticated user, or null. Convenience wrapper used
 * in route handlers that need to gate on auth.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
