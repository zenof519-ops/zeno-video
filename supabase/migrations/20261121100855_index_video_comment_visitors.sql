-- Cover the visitor foreign key used by visitor-account cleanup and joins.
CREATE INDEX IF NOT EXISTS video_comments_visitor_id_idx
  ON public.video_comments(visitor_id)
  WHERE visitor_id IS NOT NULL;
