ALTER TABLE public.hosting_usage_snapshots
  DROP CONSTRAINT IF EXISTS hosting_usage_snapshots_provider_check;
ALTER TABLE public.hosting_usage_snapshots
  ADD CONSTRAINT hosting_usage_snapshots_provider_check
  CHECK (provider = ANY (ARRAY['cloudinary','mux','imagekit','deepstorage','dropbox','onedrive','vioo','bunny']));

ALTER TABLE public.video_announcements
  ADD COLUMN IF NOT EXISTS video_download_url text;

ALTER TABLE public.video_announcements
  DROP CONSTRAINT IF EXISTS video_announcements_media_type_check;
ALTER TABLE public.video_announcements
  ADD CONSTRAINT video_announcements_media_type_check
  CHECK (
    (media_type = 'photo' AND video_provider IS NULL AND video_url IS NULL AND video_download_url IS NULL)
    OR
    (media_type = 'video'
      AND video_provider = ANY (ARRAY['cloudinary','vioo','dropbox','onedrive','deepstorage','mux','bunny'])
      AND video_url IS NOT NULL
      AND length(trim(video_url)) > 0)
  );
