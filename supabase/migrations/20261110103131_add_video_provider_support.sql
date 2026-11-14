alter table public.videos
  add column if not exists provider text not null default 'cloudinary';

alter table public.videos
  alter column cloudinary_public_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_provider_check'
      and conrelid = 'public.videos'::regclass
  ) then
    alter table public.videos
      add constraint videos_provider_check
      check (provider in ('cloudinary', 'vioo'));
  end if;
end
$$;
