-- Zeno Video: autoriser Cloudflare R2 comme hébergeur vidéo.
-- À appliquer dans Supabase uniquement au moment de la mise en service de la branche.
-- Cette migration ne modifie aucune ligne ni aucun fichier distant.

begin;

alter table public.videos
  drop constraint if exists videos_provider_check;

alter table public.videos
  add constraint videos_provider_check
  check (provider = any (array[
    'cloudinary'::text,
    'vioo'::text,
    'dropbox'::text,
    'onedrive'::text,
    'deepstorage'::text,
    'mux'::text,
    'bunny'::text,
    'r2'::text
  ]));

alter table public.video_announcements
  drop constraint if exists video_announcements_media_type_check;

alter table public.video_announcements
  add constraint video_announcements_media_type_check
  check (
    (
      media_type = 'photo'
      and video_provider is null
      and video_url is null
      and video_download_url is null
    )
    or
    (
      media_type = 'video'
      and video_provider = any (array[
        'cloudinary'::text,
        'vioo'::text,
        'dropbox'::text,
        'onedrive'::text,
        'deepstorage'::text,
        'mux'::text,
        'bunny'::text,
        'r2'::text
      ])
      and video_url is not null
      and length(trim(video_url)) > 0
    )
  );

commit;
