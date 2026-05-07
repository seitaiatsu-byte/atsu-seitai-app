/*
  # 物販・サブスク: 列不足（customer_id 等）+ PostgREST キャッシュ + anon RLS を一括修復

  症状例:
  - `Could not find the 'customer_id' column of 'subscription_records' in the schema cache`
  - `new row violates row-level security policy for table "product_sales"`

  既に 20260502140000 を部分的にしか流していない本番向け。BASE TABLE のみに ADD COLUMN IF NOT EXISTS をかけ、
  NOTIFY で PostgREST を更新し、RLS を anon 対応で作り直す。
*/

-- 以下の DO は 20260502140000 と同内容（再適用しても冪等）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'subscription_records' AND c.relkind = 'r'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscription_records' AND column_name = 'patient_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscription_records' AND column_name = 'customer_id'
    ) THEN
      ALTER TABLE public.subscription_records RENAME COLUMN patient_id TO customer_id;
    END IF;

    ALTER TABLE public.subscription_records
      ADD COLUMN IF NOT EXISTS customer_id uuid,
      ADD COLUMN IF NOT EXISTS subscription_id uuid,
      ADD COLUMN IF NOT EXISTS subscription_name text,
      ADD COLUMN IF NOT EXISTS period_id uuid,
      ADD COLUMN IF NOT EXISTS start_date date DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS payment_method text,
      ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS memo text DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS clinic_name text,
      ADD COLUMN IF NOT EXISTS staff_name text,
      ADD COLUMN IF NOT EXISTS payment_detail text,
      ADD COLUMN IF NOT EXISTS menu_name text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'product_sales' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.product_sales
      ADD COLUMN IF NOT EXISTS customer_id uuid,
      ADD COLUMN IF NOT EXISTS sale_date date DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS product_id uuid,
      ADD COLUMN IF NOT EXISTS product_name text,
      ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
      ADD COLUMN IF NOT EXISTS payment_method text,
      ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS memo text DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS clinic_name text,
      ADD COLUMN IF NOT EXISTS staff_name text,
      ADD COLUMN IF NOT EXISTS payment_detail text,
      ADD COLUMN IF NOT EXISTS menu_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'product_sales' AND c.relkind = 'r'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_product_sales_sale_date ON public.product_sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_product_sales_clinic_name ON public.product_sales(clinic_name);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'subscription_records' AND c.relkind = 'r'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_subscription_records_start_date ON public.subscription_records(start_date);
    CREATE INDEX IF NOT EXISTS idx_subscription_records_clinic_name ON public.subscription_records(clinic_name);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_sales'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.product_sales', pol.policyname);
  END LOOP;
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscription_records'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscription_records', pol.policyname);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_sales TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_records TO anon, authenticated, service_role;

CREATE POLICY app_product_sales_select ON public.product_sales
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY app_product_sales_insert ON public.product_sales
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY app_product_sales_update ON public.product_sales
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_product_sales_delete ON public.product_sales
  FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY app_subscription_records_select ON public.subscription_records
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY app_subscription_records_insert ON public.subscription_records
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY app_subscription_records_update ON public.subscription_records
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_subscription_records_delete ON public.subscription_records
  FOR DELETE TO anon, authenticated USING (true);

NOTIFY pgrst, 'reload schema';
