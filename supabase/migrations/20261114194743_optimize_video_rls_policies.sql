-- Cache auth.uid() once per statement instead of re-evaluating it for every row.
-- This preserves the existing administrator UUID and all policy behavior.
ALTER POLICY "Admin peut ajouter" ON public.videos
  WITH CHECK ((SELECT auth.uid()) = '6683090f-57d1-4d9b-b358-6107e909c40f'::uuid);

ALTER POLICY "Admin peut modifier" ON public.videos
  USING ((SELECT auth.uid()) = '6683090f-57d1-4d9b-b358-6107e909c40f'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '6683090f-57d1-4d9b-b358-6107e909c40f'::uuid);

ALTER POLICY "Admin peut supprimer" ON public.videos
  USING ((SELECT auth.uid()) = '6683090f-57d1-4d9b-b358-6107e909c40f'::uuid);

ALTER POLICY "Admin peut tout voir" ON public.videos
  USING ((SELECT auth.uid()) = '6683090f-57d1-4d9b-b358-6107e909c40f'::uuid);
