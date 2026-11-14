-- Protect public video counters against automated RPC abuse.
-- Raw client IP addresses are never stored: the Edge Function sends an HMAC-SHA256 digest.
CREATE TABLE IF NOT EXISTS public.video_counter_rate_limits (
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK (event_type IN ('view', 'download')),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (ip_hash, event_type)
);

CREATE INDEX IF NOT EXISTS video_counter_rate_limits_window_idx
  ON public.video_counter_rate_limits (window_start);

ALTER TABLE public.video_counter_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.video_counter_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_counter_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.register_video_event(
  p_video_id uuid,
  p_event_type text,
  p_ip_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_window_start timestamptz := date_trunc('minute', now());
  v_limit integer;
  v_count integer;
  v_updated integer;
BEGIN
  IF p_event_type NOT IN ('view', 'download')
     OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_video_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.videos
    WHERE id = p_video_id AND is_published = true
  ) THEN
    RETURN false;
  END IF;

  v_limit := CASE WHEN p_event_type = 'view' THEN 120 ELSE 30 END;

  INSERT INTO public.video_counter_rate_limits AS current_limit
    (ip_hash, event_type, window_start, request_count)
  VALUES
    (p_ip_hash, p_event_type, v_window_start, 1)
  ON CONFLICT (ip_hash, event_type) DO UPDATE
    SET window_start = CASE
          WHEN current_limit.window_start < v_window_start THEN v_window_start
          ELSE current_limit.window_start
        END,
        request_count = CASE
          WHEN current_limit.window_start < v_window_start THEN 1
          ELSE current_limit.request_count + 1
        END
    WHERE current_limit.window_start < v_window_start
       OR current_limit.request_count < v_limit
  RETURNING request_count INTO v_count;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_event_type = 'view' THEN
    UPDATE public.videos
      SET views = COALESCE(views, 0) + 1
      WHERE id = p_video_id AND is_published = true;
  ELSE
    UPDATE public.videos
      SET downloads = COALESCE(downloads, 0) + 1
      WHERE id = p_video_id AND is_published = true;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Keep only recent limiter rows; the indexed timestamp keeps cleanup bounded.
  DELETE FROM public.video_counter_rate_limits
    WHERE window_start < now() - interval '24 hours';

  RETURN v_updated > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_video_event(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_video_event(uuid, text, text) TO service_role;

-- Browser clients must use the rate-limited Edge Function, never the raw counter RPCs.
REVOKE EXECUTE ON FUNCTION public.register_video_view(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_video_download(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_video_view(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_video_download(uuid) TO service_role;
