create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table if not exists public.hosting_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('cloudinary','mux','imagekit','deepstorage','dropbox','onedrive','vioo')),
  status text not null check (status in ('ok','partial','needs_permission','error')),
  metrics jsonb not null default '{}'::jsonb,
  error text,
  collected_at timestamptz not null default now()
);

create index if not exists hosting_usage_snapshots_provider_collected_idx
  on public.hosting_usage_snapshots (provider, collected_at desc);

alter table public.hosting_usage_snapshots enable row level security;
revoke all on table public.hosting_usage_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.hosting_usage_snapshots to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.hosting_usage_cron_tokens (
  id integer primary key default 1 check (id = 1),
  token_hash bytea not null,
  updated_at timestamptz not null default now()
);

alter table private.hosting_usage_cron_tokens enable row level security;
revoke all on table private.hosting_usage_cron_tokens from public, anon, authenticated;
grant select, insert, update on table private.hosting_usage_cron_tokens to service_role;

create or replace function public.verify_hosting_usage_cron_token(p_token text)
returns boolean
language sql
security definer
set search_path = pg_catalog, private, extensions
as $$
  select coalesce(
    (
      select token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
      from private.hosting_usage_cron_tokens
      where id = 1
    ),
    false
  );
$$;

revoke all on function public.verify_hosting_usage_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_hosting_usage_cron_token(text) to service_role;

do $$
declare
  v_token text;
  v_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name = 'zeno_hosting_usage_cron_token') then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      'zeno_hosting_usage_cron_token',
      'Private token used only by the scheduled Zeno Video hosting usage refresh.'
    );
    insert into private.hosting_usage_cron_tokens (id, token_hash)
    values (1, extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'))
    on conflict (id) do update
      set token_hash = excluded.token_hash,
          updated_at = now();
  end if;

  for v_job_id in
    select jobid from cron.job where jobname = 'zeno-hosting-usage-6h'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'zeno-hosting-usage-6h',
    '0 */6 * * *',
    $job$
      select net.http_post(
        url := 'https://pvzucwayxudnnmskkodk.supabase.co/functions/v1/hosting-usage',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV',
          'x-zeno-monitor-token',
            (select decrypted_secret from vault.decrypted_secrets where name = 'zeno_hosting_usage_cron_token')
        ),
        body := '{"action":"refresh"}'::jsonb
      );
    $job$
  );
end
$$;
