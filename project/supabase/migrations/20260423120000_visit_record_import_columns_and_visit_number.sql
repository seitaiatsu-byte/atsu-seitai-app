-- 来院: CSV/Excel 移行用列 + 顧客別 当院通算通院回数(visit_number)
-- apply on Supabase (SQL エディタ or CLI)

ALTER TABLE public.visit_records
  ADD COLUMN IF NOT EXISTS import_customer_name text,
  ADD COLUMN IF NOT EXISTS import_csv_visit_count text,
  ADD COLUMN IF NOT EXISTS import_ticket_count_raw text,
  ADD COLUMN IF NOT EXISTS be_equivalent_count integer;

ALTER TABLE public.visit_records
  ADD COLUMN IF NOT EXISTS visit_number integer;

-- 既存行: 日付・登録日順で 1,2,3... を採番
UPDATE public.visit_records v
SET visit_number = s.n
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY visit_date ASC, created_at ASC) AS n
  FROM public.visit_records
) s
WHERE v.id = s.id
  AND (v.visit_number IS NULL);

UPDATE public.visit_records SET visit_number = 1 WHERE visit_number IS NULL;

ALTER TABLE public.visit_records
  ALTER COLUMN visit_number SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_records_customer_visitnum
  ON public.visit_records (customer_id, visit_number);
