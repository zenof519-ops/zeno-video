alter table public.video_categories
  add column if not exists is_published boolean not null default false;

comment on column public.video_categories.is_published is
  'Indique si le dossier a été publié explicitement depuis l’administration. Une catégorie non publiée reste visible si elle contient au moins une vidéo publiée.';
