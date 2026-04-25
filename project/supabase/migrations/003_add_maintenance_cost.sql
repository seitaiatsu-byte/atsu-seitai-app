ALTER TABLE public.visit_records
ADD COLUMN IF NOT EXISTS maintenance_cost numeric NOT NULL DEFAULT 0;
