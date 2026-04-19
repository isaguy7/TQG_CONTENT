# Pre-V10 migration archive

These nine SQL files predate the V10 rewrite and are **not the canonical
source of truth** for the TQG Supabase schema. They are preserved here for
historical context only — do not re-apply them.

## Why they're archived

The live DB (`hoatccxfbntgvxowufjt.supabase.co`) has 17 migrations recorded
in `supabase_migrations.schema_migrations`, and their version numbers don't
match the 9 files here. The repo files were authored by hand during early
development, then migration flow moved to the Supabase dashboard / MCP
`apply_migration` tool and the repo copies stopped being updated. Over
time they drifted from reality.

Canonical sources, in order of authority:

1. `supabase_migrations.schema_migrations` — what was actually applied, with
   SQL stored inline per row. Query via MCP `execute_sql` or via the
   Supabase dashboard.
2. [`../migrations/20260420000000_v10_baseline.sql`](../migrations/20260420000000_v10_baseline.sql)
   — flattened snapshot of the live DB reconstructed from `pg_catalog`,
   cross-checked against `list_tables(verbose=true)`.

## The 9 archived files

Mapping to applied migrations is **by name similarity**, not by verified
content equivalence. Do not assume the SQL in these files matches what
was actually applied — in at least one case (file 9), the repo version
extends the schema in ways the live DB does not have.

| File | Status | Likely counterpart in applied migrations |
|------|--------|------------------------------------------|
| `20260416000001_initial_schema.sql` | likely applied (schema intent matches live tables) | precedes the recorded migrations; possibly run before `supabase_migrations.schema_migrations` tracking started |
| `20260416000002_publish_gate.sql` | applied then reversed | `20260417175934_drop_publish_gate` drops it |
| `20260417000001_hadith_corpus.sql` | applied | `20260417105651_hadith_corpus` |
| `20260417000002_figure_refs_and_labels.sql` | applied | `20260417212149_figure_refs_and_post_labels` + `20260417212610_figure_refs_and_labels` |
| `20260418000001_surah_and_tafsir.sql` | applied | `20260418094924_surah_metadata` + `20260418095224_tafsir_cache` |
| `20260418000002_oauth_multiuser.sql` | applied | `20260418104707_oauth_tokens` + `20260418111356_multi_user_support` + `20260418111644_oauth_connections_unique_user_platform` + `20260418160321_fix_oauth_connections_unique_index` |
| `20260418000003_oauth_account_type.sql` | applied | `20260418162829_multi_account_oauth` |
| `20260418000004_user_profiles.sql` | applied | `20260418164129_user_approval_system` + `20260418164304_user_profiles_tunnel_url` |
| `20260418000005_render_queue.sql` | **never applied** | no counterpart. Adds `queued`/`completed` statuses + `payload`/`results`/`user_id`/`processed_at`/`error` columns to `clip_batch`. Live DB's `clip_batch` still has the 6-column pre-extension shape. |

Applied migrations not represented in this archive:

- `20260417102416_disable_rls_all_tables` — the `ALTER TABLE ... DISABLE ROW
  LEVEL SECURITY` pass that made RLS-off explicit on the 10 tables that
  existed at that time. Superseded by V10 RLS remediation
  (`20260420000010_v10_enable_rls.sql`).
- `20260417212855_soft_delete_posts` — added `posts.deleted_at`.
- `20260417213232_posts_deleted_at_index` — added the partial index on
  `deleted_at`.
- `20260418094505_remove_verification_ceremony` — removed an earlier
  manual-verification workflow from `hadith_verifications`.

All of the above are folded into `20260420000000_v10_baseline.sql`.

## Future work

Once the V10 baseline has been applied cleanly to a staging environment and
the feature branch merged, the archive can be moved out of the repo
entirely (or kept as a git tag). For now, keeping it in-tree makes the
archaeology discoverable.
