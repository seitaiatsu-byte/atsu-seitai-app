-- 個人カルテ・来院履歴の修正・削除、来院入力の履歴修正で UPDATE/DELETE が必要

DROP POLICY IF EXISTS "anon_visit_records_update" ON public.visit_records;
CREATE POLICY "anon_visit_records_update"
  ON public.visit_records
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_visit_records_delete" ON public.visit_records;
CREATE POLICY "anon_visit_records_delete"
  ON public.visit_records
  FOR DELETE
  TO anon, authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_records TO anon, authenticated, service_role;
