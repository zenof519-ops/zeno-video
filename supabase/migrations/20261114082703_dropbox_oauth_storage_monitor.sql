create table if not exists public.dropbox_oauth_states (
  state_hash text primary key,
  expires_at timestamptz not null
);
create index if not exists dropbox_oauth_states_expires_at_idx
  on public.dropbox_oauth_states (expires_at);

create table if not exists public.dropbox_oauth_credentials (
  id integer primary key default 1 check (id = 1),
  refresh_token text not null,
  account_id text,
  connected_at timestamptz not null default now()
);

alter table public.dropbox_oauth_states enable row level security;
alter table public.dropbox_oauth_credentials enable row level security;
