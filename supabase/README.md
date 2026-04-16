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

## Publish gate

`20260416000002_publish_gate.sql` installs a trigger that blocks
`posts.status='ready'` whenever any linked hadith in `post_hadith_refs` has
`verified=false`. This is the DB half of the safety kernel described in the
refined spec. The Node-side `lib/publish-gate.ts` (Phase 2) wraps the same
check so API callers get a clean error before the round-trip.

Never drop this trigger. Never mark a hadith verified without actually
checking sunnah.com.
