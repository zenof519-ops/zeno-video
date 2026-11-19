alter table public.video_categories
  add column if not exists is_hidden boolean not null default false;

comment on column public.video_categories.is_hidden is
  'Masque explicitement un dossier du site public après une action de dépublication, même si des vidéos publiées y sont encore classées.';
