CREATE TABLE IF NOT EXISTS public.main_complaint_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.main_complaint_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "main_complaint_master_select_all" ON public.main_complaint_master;
DROP POLICY IF EXISTS "main_complaint_master_insert_all" ON public.main_complaint_master;
DROP POLICY IF EXISTS "main_complaint_master_update_all" ON public.main_complaint_master;
DROP POLICY IF EXISTS "main_complaint_master_delete_all" ON public.main_complaint_master;

CREATE POLICY "main_complaint_master_select_all"
  ON public.main_complaint_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "main_complaint_master_insert_all"
  ON public.main_complaint_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "main_complaint_master_update_all"
  ON public.main_complaint_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "main_complaint_master_delete_all"
  ON public.main_complaint_master FOR DELETE TO anon, authenticated USING (true);
