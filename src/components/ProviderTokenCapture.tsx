"use client";

import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";

/**
 * Listens for Supabase auth events and persists the OAuth provider token
 * (LinkedIn / X) into our `oauth_connections` table via /api/auth/save-token.
 *
 * Why this lives on the client: Supabase only surfaces `provider_token` /
 * `provider_refresh_token` in the browser-side session payload, and only
 * briefly — they fire on INITIAL_SESSION / SIGNED_IN right after the
 * redirect-back, and may be stripped from subsequent getSession() calls.
 * So we hook onAuthStateChange for the earliest opportunity.
 */
export function ProviderTokenCapture({
  onSaved,
}: {
  onSaved?: (platform: "linkedin" | "x") => void;
} = {}) {
  const savedKey = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const summarise = (session: Session | null) => ({
      hasSession: !!session,
      provider_token: session?.provider_token
        ? session.provider_token.slice(0, 10) + "…"
        : null,
      provider_refresh_token: !!session?.provider_refresh_token,
      provider: session?.user?.app_metadata?.provider ?? null,
      providers: session?.user?.app_metadata?.providers ?? null,
      identities_count: session?.user?.identities?.length ?? 0,
      identities: session?.user?.identities?.map((i) => i.provider) ?? [],
      email: session?.user?.email ?? null,
      expires_in: session?.expires_in ?? null,
      // Expose every top-level key on the session so we can see exactly
      // what Supabase is handing us in each event.
      session_keys: session ? Object.keys(session) : [],
    });

    const attemptSave = async (
      session: Session | null,
      trigger: string
    ) => {
      console.log(
        `[ProviderTokenCapture] ${trigger} session:`,
        JSON.stringify(summarise(session))
      );
      if (!session) return;
      const providerToken = session.provider_token;
      if (!providerToken) {
        console.log(
          `[ProviderTokenCapture] ${trigger} — no provider_token, skipping save`
        );
        return;
      }

      const user = session.user;
      const provider = (user.app_metadata?.provider as string | undefined) || "";
      if (!provider) {
        console.log(
          `[ProviderTokenCapture] ${trigger} — no provider in app_metadata, skipping`
        );
        return;
      }

      // De-dupe — the same token shouldn't be saved on every event fire.
      const key = `${provider}:${providerToken.slice(0, 24)}`;
      if (savedKey.current === key) {
        console.log(
          `[ProviderTokenCapture] ${trigger} — token already saved this session, skipping`
        );
        return;
      }
      savedKey.current = key;

      try {
        const res = await fetch("/api/auth/save-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            provider_token: providerToken,
            provider_refresh_token: session.provider_refresh_token ?? null,
            expires_in: session.expires_in ?? null,
            identity: user.user_metadata ?? null,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            platform?: "linkedin" | "x";
          };
          console.log(
            `[ProviderTokenCapture] ${trigger} — saved token for platform=${body.platform}`
          );
          if (body.platform) {
            onSaved?.(body.platform);
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("oauth-connection-saved", {
                  detail: { platform: body.platform },
                })
              );
            }
          }
        } else {
          const text = await res.text();
          console.error(
            `[ProviderTokenCapture] ${trigger} — save-token HTTP ${res.status}`,
            text
          );
          // Allow a retry on next event if this one failed.
          savedKey.current = null;
        }
      } catch (err) {
        console.error(
          `[ProviderTokenCapture] ${trigger} — save-token error`,
          err
        );
        savedKey.current = null;
      }
    };

    // Fallback: if Supabase's implicit flow put the provider_token in the
    // URL fragment (#provider_token=…), consume it directly before any
    // navigation clears it. Harmless when no fragment is present.
    const consumeHashFragment = async () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;
      if (!hash || !hash.includes("provider_token=")) return;
      const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const providerToken = params.get("provider_token");
      if (!providerToken) return;
      const providerRefresh = params.get("provider_refresh_token");
      const expiresIn = params.get("expires_in");

      // Resolve the provider + identity from the current session so we can
      // classify the token into linkedin / x and pull a display name.
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      const provider =
        (session?.user?.app_metadata?.provider as string | undefined) || "";
      if (!provider) {
        console.log(
          "[ProviderTokenCapture] hash — no provider in session, skipping"
        );
        return;
      }
      const key = `${provider}:${providerToken.slice(0, 24)}`;
      if (savedKey.current === key) return;
      savedKey.current = key;

      console.log("[ProviderTokenCapture] hash — consuming provider_token");
      try {
        const res = await fetch("/api/auth/save-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            provider_token: providerToken,
            provider_refresh_token: providerRefresh,
            expires_in: expiresIn ? Number(expiresIn) : null,
            identity: session?.user?.user_metadata ?? null,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { platform?: "linkedin" | "x" };
          console.log(
            `[ProviderTokenCapture] hash — saved token for platform=${body.platform}`
          );
          if (body.platform && typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("oauth-connection-saved", {
                detail: { platform: body.platform },
              })
            );
            onSaved?.(body.platform);
          }
          // Scrub the fragment so the token doesn't sit in the URL bar.
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search
          );
        } else {
          console.error(
            "[ProviderTokenCapture] hash — save-token HTTP",
            res.status,
            await res.text()
          );
          savedKey.current = null;
        }
      } catch (err) {
        console.error("[ProviderTokenCapture] hash — error", err);
        savedKey.current = null;
      }
    };
    void consumeHashFragment();

    // INITIAL_SESSION fires exactly once when the listener attaches with
    // whatever session the browser currently has. With Supabase PKCE, the
    // provider_token is only present on this event (and SIGNED_IN); it can
    // be missing from subsequent getSession() results.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[ProviderTokenCapture] event=${event}`);
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        attemptSave(session, event);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [onSaved]);

  return null;
}
