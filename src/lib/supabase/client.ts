// sync, returns browser client with PKCE
//
// Session-aware Supabase client for use in Client Components. Singleton so
// repeated calls across the app return the same instance. PKCE flow matches
// the server-side exchange performed in /auth/callback.
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
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}
