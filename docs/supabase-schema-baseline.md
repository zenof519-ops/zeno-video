# Supabase schema baseline — Zeno Video

> **Reference snapshot, not an executable migration.** Captured 2026-11-14 from the connected Supabase production project. This document records observed state only. Do not run it as SQL, replay migrations, or use it to overwrite production.

## Project and source of truth

- Supabase project ref: `pvzucwayxudnnmskkodk`
- Repository: `zenof519-ops/zeno-video`
- Branch used for this document: `docs/supabase-schema-baseline`
- Main commit inspected: `122093d18b52b4faef92b3869691d4b140bc9b98`
- Database schema is the observed live state; Git history is the source for migration scripts that are actually committed.

## Applied migration history (live Supabase)

The database reports these 9 applied migrations, in order:

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

## Migration files present in `main`

Observed files:

- `supabase/migrations/20261111074251_add_deepstorage_provider.sql`
- `supabase/migrations/20261113090000_add_mux_video_host.sql`
- `supabase/migrations/20261113225936_add_thumbnail_asset_tracking.sql`
- `supabase/migrations/20261113233134_hosting_usage_monitor.sql`

### Reconciliation gaps

1. Five applied migration names have no corresponding SQL file in the inspected `main` tree:
   - `add_video_provider_support`
   - `add_onedrive_download_url`
   - `grant_mux_service_role_video_write`
   - `dropbox_oauth_storage_monitor`
   - `grant_dropbox_oauth_service_role_privileges`
2. The committed Mux migration filename uses version `20261113090000`, while the live migration history records `20261113210007` for `add_mux_video_host`.
3. Git history for `supabase/migrations/` shows four committed migration-file additions; the five absent SQL bodies were not recovered from the inspected repository history.

**Do not fabricate the missing SQL or alter `supabase_migrations.schema_migrations` to make the lists match.** Recover the original SQL from trusted backups, developer machines, deployment artifacts, or the exact commits/PRs that applied them before reconstructing executable history.

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

On `public.videos`:
- Public SELECT for `anon` and `authenticated` only where `is_published = true`.
- Admin INSERT, UPDATE, DELETE and SELECT policies for the configured administrator UUID.
- No policies were returned for the other four tables; their RLS remains enabled.

## Observed database functions

- `public.register_video_download(p_video_id uuid)` — SECURITY DEFINER.
- `public.register_video_view(p_video_id uuid)` — SECURITY DEFINER.
- `public.verify_hosting_usage_cron_token(p_token text)` — SECURITY DEFINER.

The first two are callable by `anon` and `authenticated` according to Supabase Security Advisor. This may be intentional for anonymous public counters, but it is an abuse/forgery risk that needs a separate design review. Do not revoke or change them until the public counter flow and its authorization requirements have been inspected.

## Scheduled monitoring and extensions

- Cron job `zeno-hosting-usage-6h` is active, schedule `0 */6 * * *`.
- Installed extensions observed: `pg_cron`, `pg_net`, `pgcrypto`.
- Supabase Advisor reports `pg_net` installed in the `public` schema.

## Security Advisor findings observed 2026-11-14

- RLS enabled with no policies on four tables: `private.hosting_usage_cron_tokens`, `public.dropbox_oauth_credentials`, `public.dropbox_oauth_states`, `public.hosting_usage_snapshots`. This can be deliberate for service-only tables; verify grants and service access before changing.
- `pg_net` extension in `public`.
- Public execution of SECURITY DEFINER counter functions `register_video_download` and `register_video_view`.
- Leaked-password protection disabled in Supabase Auth.

Advisor findings are review items, not proof of exploitable access. Validate effective grants, function bodies, and actual call paths before remediation.

## Safe next steps

1. Recover the original SQL for the five missing applied migrations from trusted sources.
2. Determine why the Mux migration version differs between the live ledger and committed filename; preserve both records until the cause is established.
3. Compare recovered SQL with the live schema and grants; document any drift.
4. Only then establish a clean forward migration workflow. Do not reset production, delete migration ledger rows, or replay historical DDL.
5. Separately review service-only table grants, public counter abuse controls, and Auth leaked-password protection.

## Capture limitations

This is a structural inventory, not a full schema dump. It does not include function bodies, every grant, every table constraint, every sequence, every view, or Edge Function secrets. No secret values were read. No database writes or schema changes were performed for this snapshot.
