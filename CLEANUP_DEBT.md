# Cleanup debt

Small technical-debt items discovered during V10 M1 work that are safe to
defer. Each entry records the date it was noted, what needs to happen, and
the reason it wasn't done at the time.

New entries go at the top.

---

- **2026-04-19 — `posts.platforms` has no CHECK constraint.** The new
  `platforms TEXT[]` column (added in `20260419111246_v10_post_status_and_columns`)
  accepts any string, unlike the pre-existing `posts.platform` scalar which
  is restricted to `linkedin/x/instagram/facebook/meta` via CHECK. A post
  row could be inserted with `platforms = ['bluesky']` today and the editor
  would crash on platform-config lookup. Add a CHECK that every element
  of `platforms` is one of `linkedin/x/instagram/facebook/meta` in a
  future migration. Low-priority until public signup opens; today only
  Isa can write posts and none do.

- **2026-04-19 — `pg_trgm` extension still in `public` schema.** Move to
  `extensions` schema. Two indexes depend on it and need to be verified
  after the move:
  - `public.quran_cache.quran_cache_normalized_trgm_idx` (GIN on
    `normalized gin_trgm_ops`)
  - `public.hadith_corpus.hadith_corpus_english_trgm_idx` (GIN on
    `english_text gin_trgm_ops`)

  Blocker: `ALTER EXTENSION pg_trgm SET SCHEMA extensions` has to be
  branch-tested to confirm those indexes keep working without recreation.
  Don't run in prod until the Supabase branch test passes. Supabase
  security advisor flags this as a WARN — acceptable for now.

- **2026-04-19 — `oauth_connections.platform` CHECK includes unused
  `'meta'` value.** The current constraint is:
  ```
  CHECK (platform = ANY (ARRAY['linkedin','x','instagram','facebook','meta']))
  ```
  `'meta'` was never used by the app and is vestigial. Drop it in a future
  cleanup migration; reduce the ARRAY to the 4 real platforms. Harmless
  until then because nothing writes `'meta'`.

- **2026-04-19 — Supabase Auth leaked-password protection is OFF.** Turn
  on via Supabase dashboard (`Authentication → Policies → Password
  security → Leaked password protection`). This is an Auth setting, not a
  migration. Do this before public launch. Supabase security advisor
  flags as WARN.
