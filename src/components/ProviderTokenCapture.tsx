"use client";

import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";

/**
 * Listens for Supabase auth events and persists the OAuth provider token
 * (LinkedIn / X) into our `oauth_connections` table via /api/auth/save-token.
 *
 * Why this lives on the client: Supabase only exposes `session.provider_token`
 * and `session.provider_refresh_token` in the browser-side session payload.
 * The server-side `exchangeCodeForSession` call (in /auth/callback) returns
 * null for those fields, so the capture has to happen here after the browser
 * hydrates the session post-redirect.
 *
 * Mount this in the Settings page (the standard post-OAuth `next`). It is a
 * no-op unless a fresh provider_token is present.
 */
export function ProviderTokenCapture({
  onSaved,
}: {
  onSaved?: (platform: "linkedin" | "x") => void;
} = {}) {
  const savedKey = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const attemptSave = async (session: Session | null) => {
      if (!session) return;
      const providerToken = session.provider_token;
      if (!providerToken) return;

      const user = session.user;
      const provider = (user.app_metadata?.provider as string | undefined) || "";
      if (!provider) return;

      // De-dupe — the same token shouldn't be saved on every mount.
      const key = `${provider}:${providerToken.slice(0, 24)}`;
      if (savedKey.current === key) return;
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
          console.error(
            "[ProviderTokenCapture] save-token failed",
            await res.text()
          );
        }
      } catch (err) {
        console.error("[ProviderTokenCapture] save-token error", err);
      }
    };

    // Check the current session on mount — handles the redirect case where
    // SIGNED_IN may have fired before this listener attached.
    supabase.auth.getSession().then(({ data }) => attemptSave(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        attemptSave(session);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [onSaved]);

  return null;
}
