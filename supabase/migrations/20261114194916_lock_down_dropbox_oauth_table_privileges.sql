-- OAuth state and refresh-token tables are server-only.
-- Remove all table privileges from browser roles and re-grant only the
-- minimum operations required by the Dropbox OAuth Edge Function.
REVOKE ALL PRIVILEGES ON TABLE public.dropbox_oauth_credentials
  FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.dropbox_oauth_states
  FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.dropbox_oauth_credentials
  TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.dropbox_oauth_states
  TO service_role;
