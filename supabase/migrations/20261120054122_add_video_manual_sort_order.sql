alter table public.videos
  add column if not exists sort_order integer not null default 1000000;

with ranked_videos as (
  select
    id,
    row_number() over (
      partition by category_id
      order by created_at desc nulls last, id
    ) * 10 as position
  from public.videos
)
update public.videos as videos
set sort_order = ranked_videos.position
from ranked_videos
where videos.id = ranked_videos.id;

create index if not exists videos_category_sort_order_idx
  on public.videos (category_id, sort_order, created_at desc);

comment on column public.videos.sort_order is
  'Ordre manuel d’affichage public dans la liste sans catégorie ou dans le dossier correspondant. Les valeurs les plus petites apparaissent en premier.';
