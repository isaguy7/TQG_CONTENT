import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }
  client = createBrowserClient(url, anonKey, {
    auth: {
      // We exchange the code server-side in /auth/callback. If the browser
      // client also auto-consumes it on the next page load, the PKCE
      // verifier gets invalidated mid-flight and the server exchange
      // reports "OAuth state not found". Disable the browser's in-URL
      // auto-detection so the server is the sole exchanger.
      detectSessionInUrl: false,
      // Explicit PKCE — matches the server-side createServerClient flow
      // used by /auth/callback and middleware.
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}
