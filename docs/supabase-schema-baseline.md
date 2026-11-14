# Supabase schema baseline — Zeno Video

> **Reference snapshot, not an executable migration.** Captured 2026-11-14 from the connected Supabase production project. This document records observed state only. Do not run it as SQL, replay migrations, or use it to overwrite production.

## Project and source of truth

- Supabase project ref: `pvzucwayxudnnmskkodk`
- Repository: `zenof519-ops/zeno-video`
- Database schema is the observed live state; committed migration files are the repository's historical migration artifacts.
- Five previously missing migration SQL bodies were recovered verbatim from `supabase_migrations.schema_migrations.statements` on 2026-11-14 and restored as files in Git. The query was read-only.

## Applied migration history (live Supabase)

The database reports these 11 applied migrations, in order:

| Version | Name |
|---|---|
| 20261110103131 | add_video_provider_support |
| 20261110202339 | add_onedrive_download_url |
| 20261111074251 | add_deepstorage_provider |
| 20261113210007 | add_mux_video_host |
| 20261113211935 | grant_mux_service_role_video_write |
| 20261113225936 | add_thumbnail_asset_tracking |
| 20261113233134 | hosting_usage_monitor |
| 20261114082703 | dropbox_oauth_storage_monitor |
| 20261114083707 | grant_dropbox_oauth_service_role_privileges |
| 20261114194743 | optimize_video_rls_policies |
| 20261114194756 | merge_video_select_rls_policy |

## Migration files present before recovery

The four files originally present in `main` were:

- `supabase/migrations/20261111074251_add_deepstorage_provider.sql`
- `supabase/migrations/20261113090000_add_mux_video_host.sql`
- `supabase/migrations/20261113225936_add_thumbnail_asset_tracking.sql`
- `supabase/migrations/20261113233134_hosting_usage_monitor.sql`

## Five restored migration files

The following original SQL bodies were read from the applied migration registry and restored without modification:

- `20261110103131_add_video_provider_support.sql`
- `20261110202339_add_onedrive_download_url.sql`
- `20261113211935_grant_mux_service_role_video_write.sql`
- `20261114082703_dropbox_oauth_storage_monitor.sql`
- `20261114083707_grant_dropbox_oauth_service_role_privileges.sql`

The source query selected only `version`, `name`, and `statements` for these five migration records. It did not read OAuth credential values. No migration was replayed and no production schema, data, or permissions were changed during recovery.

## Mux migration version reconciliation

The original Mux migration SQL was compared with the exact statement stored in the live migration registry for `20261113210007_add_mux_video_host`; the SQL bodies match. The repository file has therefore been renamed to `20261113210007_add_mux_video_host.sql` so the local migration filename matches the already-applied production version. This is a repository-only correction: the production migration ledger was not edited and the migration was not replayed.

## Observed live tables

All five observed tables have RLS enabled.

### `public.videos`

| Column | Type | Nullable | Default |
|---|---|---:|---|
| id | uuid | no | gen_random_uuid() |
| title | text | no | — |
| description | text | yes | '' |
| cloudinary_public_id | text | yes | — |
| playback_url | text | no | — |
| thumbnail_url | text | yes | — |
| created_at | timestamptz | yes | now() |
| is_published | boolean | yes | true |
| views | bigint | no | 0 |
| format | text | yes | — |
| downloads | bigint | no | 0 |
| provider | text | no | 'cloudinary' |
| download_url | text | yes | — |
| mux_upload_id | text | yes | — |
| mux_asset_id | text | yes | — |
| mux_playback_id | text | yes | — |
| mux_status | text | yes | — |
| thumbnail_provider | text | yes | — |
| thumbnail_cloudinary_public_id | text | yes | — |
| thumbnail_imagekit_file_id | text | yes | — |

Observed constraints:
- Primary key on `id`.
- Unique constraint on `cloudinary_public_id`.
- `provider` accepts `cloudinary`, `vioo`, `dropbox`, `onedrive`, `deepstorage`, `mux`.
- `mux_status` accepts null, `waiting`, `processing`, `ready`, `errored`, `upload_failed`.

Observed indexes:
- Primary key on `id`.
- Unique `cloudinary_public_id`.
- Partial index on `mux_asset_id` when not null.
- Partial unique index on `mux_upload_id` when not null.

### Other observed tables

- `public.dropbox_oauth_credentials`: `id integer`, `refresh_token text`, `account_id text`, `connected_at timestamptz`. RLS enabled.
- `public.dropbox_oauth_states`: `state_hash text`, `expires_at timestamptz`. RLS enabled.
- `public.hosting_usage_snapshots`: `id uuid`, `provider text`, `status text`, `metrics jsonb`, `error text`, `collected_at timestamptz`. RLS enabled.
- `private.hosting_usage_cron_tokens`: `id integer`, `token_hash bytea`, `updated_at timestamptz`. RLS enabled.

Sensitive column values (OAuth refresh tokens, token hashes) were deliberately not queried or recorded.

## Observed RLS policies

On `public.videos` (after the 2026-11-14 RLS optimization):
- One SELECT policy allows `anon` and `authenticated` to read published videos, and additionally allows the configured administrator UUID to read unpublished videos.
- Admin INSERT, UPDATE and DELETE policies remain restricted to the same configured administrator UUID.
- The four service tables retain RLS enabled and no end-user policies; access is intended for server-side `service_role` only.

## Observed database functions

- `public.register_video_download(p_video_id uuid)` — SECURITY DEFINER.
- `public.register_video_view(p_video_id uuid)` — SECURITY DEFINER.
- `public.verify_hosting_usage_cron_token(p_token text)` — SECURITY DEFINER.

The first two are callable by `anon` and `authenticated` according to Supabase Security Advisor. This may be intentional for anonymous public counters, but it is an abuse/forgery risk that needs a separate design review. Do not revoke or change them until the public counter flow and its authorization requirements have been inspected.

## Scheduled monitoring and extensions

- Cron job `zeno-hosting-usage-6h` is active, schedule `0 */6 * * *`.
- Installed extensions observed: `pg_cron`, `pg_net`, `pgcrypto`.
- Supabase Advisor reports `pg_net` installed in the `public` schema.

## Security Advisor findings observed 2026-11-14 (after RLS optimization)

- RLS enabled with no policies on four tables: `private.hosting_usage_cron_tokens`, `public.dropbox_oauth_credentials`, `public.dropbox_oauth_states`, `public.hosting_usage_snapshots`. This can be deliberate for service-only tables; verify grants and service access before changing.
- `pg_net` extension in `public`.
- Public execution of SECURITY DEFINER counter functions `register_video_download` and `register_video_view` remains. Their bodies only increment counters on published video rows, but callers can still forge/inflate metrics; hardening requires a deliberate public-counter design.
- Leaked-password protection disabled in Supabase Auth.
- The RLS `auth.uid()` per-row performance findings and duplicate permissive SELECT policy finding were cleared by migrations `20261114194743` and `20261114194756`.

Advisor findings are review items, not proof of exploitable access. Validate effective grants, function bodies, and actual call paths before remediation.

## Safe next steps

1. Keep migration filenames aligned with the live migration registry; the Mux mismatch is now corrected in Git without changing production history.
2. Continue to review service-only table grants, public counter abuse controls, and Auth leaked-password protection.
3. Establish a clean forward migration workflow. Do not reset production, delete migration ledger rows, or replay historical DDL files.

## Capture limitations

This is a structural inventory, not a full schema dump. It does not include function bodies, every grant, every table constraint, every sequence, every view, or Edge Function secrets. No secret values were read. Historical migration recovery did not change production schema or data. The two explicitly documented RLS optimization migrations were applied and verified on 2026-11-14.
