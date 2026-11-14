ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS mux_upload_id text,
  ADD COLUMN IF NOT EXISTS mux_asset_id text,
  ADD COLUMN IF NOT EXISTS mux_playback_id text,
  ADD COLUMN IF NOT EXISTS mux_status text;

ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_provider_check;
ALTER TABLE public.videos ADD CONSTRAINT videos_provider_check
CHECK (provider = ANY (ARRAY[
  'cloudinary'::text,
  'vioo'::text,
  'dropbox'::text,
  'onedrive'::text,
  'deepstorage'::text,
  'mux'::text
]));

ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_mux_status_check;
ALTER TABLE public.videos ADD CONSTRAINT videos_mux_status_check
CHECK (mux_status IS NULL OR mux_status = ANY (ARRAY[
  'waiting'::text,
  'processing'::text,
  'ready'::text,
  'errored'::text,
  'upload_failed'::text
]));

CREATE UNIQUE INDEX IF NOT EXISTS videos_mux_upload_id_unique
  ON public.videos (mux_upload_id)
  WHERE mux_upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS videos_mux_asset_id_idx
  ON public.videos (mux_asset_id)
  WHERE mux_asset_id IS NOT NULL;
