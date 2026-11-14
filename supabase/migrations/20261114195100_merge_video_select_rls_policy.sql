-- Keep public reads for published videos and allow the single configured admin
-- to read unpublished videos through one policy instead of overlapping SELECT policies.
ALTER POLICY "Lecture publique des vidéos" ON public.videos
  USING (
    is_published = true
    OR (SELECT auth.uid()) = '6683090f-57d1-4d9b-b358-6107e909c40f'::uuid
  );

DROP POLICY "Admin peut tout voir" ON public.videos;
