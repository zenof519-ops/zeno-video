ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_provider_check;
ALTER TABLE public.videos ADD CONSTRAINT videos_provider_check
CHECK (provider = ANY (ARRAY[
  'cloudinary'::text,
  'vioo'::text,
  'dropbox'::text,
  'onedrive'::text,
  'deepstorage'::text
]));
