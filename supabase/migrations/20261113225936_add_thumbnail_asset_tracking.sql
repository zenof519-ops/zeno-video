alter table public.videos
  add column if not exists thumbnail_provider text,
  add column if not exists thumbnail_cloudinary_public_id text,
  add column if not exists thumbnail_imagekit_file_id text;

update public.videos
set thumbnail_provider = case
  when thumbnail_url like 'https://ik.imagekit.io/%' then 'imagekit'
  when thumbnail_url like 'https://res.cloudinary.com/wnonuvx4/image/upload/%' then 'cloudinary'
  when thumbnail_url like 'https://res.cloudinary.com/wnonuvx4/video/upload/%' then 'cloudinary_video'
  else thumbnail_provider
end
where thumbnail_url is not null
  and thumbnail_provider is null;

update public.videos
set thumbnail_cloudinary_public_id =
  regexp_replace(
    regexp_replace(
      split_part(split_part(thumbnail_url, '/image/upload/', 2), '?', 1),
      '^v[0-9]+/',
      ''
    ),
    '[.][^.]+$',
    ''
  )
where thumbnail_provider = 'cloudinary'
  and thumbnail_cloudinary_public_id is null
  and thumbnail_url like 'https://res.cloudinary.com/wnonuvx4/image/upload/%';
