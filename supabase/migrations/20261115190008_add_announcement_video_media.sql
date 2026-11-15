ALTER TABLE public.video_announcements
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS video_provider text,
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.video_announcements
  DROP CONSTRAINT IF EXISTS video_announcements_media_type_check;

ALTER TABLE public.video_announcements
  ADD CONSTRAINT video_announcements_media_type_check
  CHECK (
    (media_type = 'photo' AND video_provider IS NULL AND video_url IS NULL)
    OR
    (media_type = 'video'
      AND video_provider = ANY (ARRAY['cloudinary','vioo','dropbox','onedrive','deepstorage','mux'])
      AND video_url IS NOT NULL
      AND length(trim(video_url)) > 0)
  );
