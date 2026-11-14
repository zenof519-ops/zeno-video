alter table public.videos add column if not exists download_url text;
comment on column public.videos.download_url is 'Optional direct or shared download URL for external video providers such as OneDrive.';
