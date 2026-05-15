-- main_complaint_master（旧）→ chief_complaint_master（現行）へ名称を同期
INSERT INTO public.chief_complaint_master (name, display_order, is_active)
SELECT m.name, m.display_order, COALESCE(m.is_active, true)
FROM public.main_complaint_master m
WHERE trim(m.name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.chief_complaint_master c WHERE c.name = m.name
  );

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referral_source_3 text;

COMMENT ON COLUMN public.customers.referral_source_3 IS '流入経路3（サブ2）';
