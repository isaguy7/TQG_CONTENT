# Supabase schema

Migrations run in timestamp order.

## Applying migrations

With the Supabase CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste each `.sql` file into the Supabase SQL editor in order.

## Tables

| Table                  | Phase | Purpose                                                      |
| ---------------------- | ----- | ------------------------------------------------------------ |
| `islamic_figures`      | 3     | Sahabah, prophets, scholars. Seeded with 10-15 starter rows. |
| `hadith_verifications` | 2     | Every hadith ref used in content. Default `verified=false`.  |
| `post_hadith_refs`     | 2     | Junction; the only path for hadith refs on posts.            |
| `quran_cache`          | 4     | All 6,236 ayahs with normalized Arabic for fuzzy matching.   |
| `posts`                | 1+    | Drafts, reviews, published.                                  |
| `video_projects`       | 1/5   | Downloads, transcripts, renders.                             |
| `clip_batch`           | 5     | Groups short clips into batch sessions.                      |
| `content_calendar`     | v2    | Weekly tracking + gap alerts.                                |
| `content_revisions`    | all   | Generic version history (replaces `posts.draft_versions`).   |
| `api_usage`            | v2    | Optional Claude API cost tracking.                           |

## Publish gate (historical)

An early DB trigger in `20260416000002_publish_gate.sql` blocked
`posts.status='ready'` whenever any linked hadith had `verified=false`.
That trigger was dropped in `20260417175934_drop_publish_gate`, and the
`'ready'` status itself was removed in V10 M1 §2
(`20260419111246_v10_post_status_and_columns`).

V10 M1 §7 will re-introduce UNVERIFIED enforcement with a new trigger
that blocks transitions into `scheduled`/`published` when any linked
hadith is unverified. The Node-side `src/lib/publish-gate.ts` has no
active call sites until §7 lands.
