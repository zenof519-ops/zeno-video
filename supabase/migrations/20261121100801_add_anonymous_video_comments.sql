-- Anonymous public comments for Zeno Video.
-- All writes and reads go through the video-comments Edge Function; browser roles
-- receive no direct table privileges. Visitor edit tokens are stored as SHA-256 hashes.

CREATE SEQUENCE IF NOT EXISTS public.video_comment_visitor_seq;

CREATE TABLE IF NOT EXISTS public.video_comment_visitors (
  visitor_id uuid PRIMARY KEY,
  display_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.video_comments(id) ON DELETE CASCADE,
  visitor_id uuid NULL REFERENCES public.video_comment_visitors(visitor_id) ON DELETE SET NULL,
  author_type text NOT NULL CHECK (author_type IN ('visitor', 'admin')),
  author_name text NOT NULL,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 2000),
  edit_token_hash text NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_comments_author_shape CHECK (
    (author_type = 'visitor' AND visitor_id IS NOT NULL AND edit_token_hash IS NOT NULL AND parent_id IS NULL)
    OR
    (author_type = 'admin' AND visitor_id IS NULL AND edit_token_hash IS NULL AND parent_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS video_comments_video_created_idx
  ON public.video_comments(video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_comments_parent_created_idx
  ON public.video_comments(parent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS video_comments_hidden_idx
  ON public.video_comments(is_hidden, created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_comment_rate_limits (
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('identify', 'list', 'create', 'edit')),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (ip_hash, action)
);
CREATE INDEX IF NOT EXISTS video_comment_rate_limits_window_idx
  ON public.video_comment_rate_limits(window_start);

ALTER TABLE public.video_comment_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_comment_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.video_comment_visitors FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.video_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.video_comment_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_comment_visitors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_comments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_comment_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_video_comment_visitor(p_visitor_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing text;
  v_number bigint;
  v_value bigint;
  v_label text := '';
BEGIN
  IF p_visitor_id IS NULL THEN
    RAISE EXCEPTION 'visitor id is required';
  END IF;

  SELECT display_name INTO v_existing
  FROM public.video_comment_visitors
  WHERE visitor_id = p_visitor_id;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_number := nextval('public.video_comment_visitor_seq'::regclass);
  v_value := v_number;
  WHILE v_value > 0 LOOP
    v_label := chr(65 + ((v_value - 1) % 26)::integer) || v_label;
    v_value := (v_value - 1) / 26;
  END LOOP;

  INSERT INTO public.video_comment_visitors(visitor_id, display_name)
  VALUES (p_visitor_id, 'Utilisateur ' || v_label)
  ON CONFLICT (visitor_id) DO NOTHING;

  SELECT display_name INTO v_existing
  FROM public.video_comment_visitors
  WHERE visitor_id = p_visitor_id;

  RETURN v_existing;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_video_comment_visitor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_video_comment_visitor(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_video_comment_rate_limit(
  p_ip_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_action NOT IN ('identify', 'list', 'create', 'edit')
     OR p_limit < 1
     OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.video_comment_rate_limits AS current_limit
    (ip_hash, action, window_start, request_count)
  VALUES (p_ip_hash, p_action, v_window_start, 1)
  ON CONFLICT (ip_hash, action) DO UPDATE
    SET window_start = CASE
          WHEN current_limit.window_start < v_window_start THEN v_window_start
          ELSE current_limit.window_start
        END,
        request_count = CASE
          WHEN current_limit.window_start < v_window_start THEN 1
          ELSE current_limit.request_count + 1
        END
    WHERE current_limit.window_start < v_window_start
       OR current_limit.request_count < p_limit
  RETURNING request_count INTO v_count;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.video_comment_rate_limits
  WHERE window_start < clock_timestamp() - interval '24 hours';

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_video_comment_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_video_comment_rate_limit(text, text, integer, integer) TO service_role;
