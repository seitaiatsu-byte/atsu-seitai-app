/*
  # 物販・サブスク登録の修復（本番で product_sales が無い / 列不足 / anon で RLS 拒否）

  症状例: PostgREST `Could not find the table 'public.product_sales' in the schema cache`
  原因: 本番 DB にマイグレーション未適用、または古いスキーマのまま。

  このファイルは冪等です。Supabase CLI の `db push` または SQL エディタで実行してください。
*/

-- period_master（subscription_records.period_id 用。001 と整合）
CREATE TABLE IF NOT EXISTS public.period_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 物販記録（アプリ・database.types と整合）
CREATE TABLE IF NOT EXISTS public.product_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  product_id uuid REFERENCES public.product_master(id),
  product_name text,
  quantity integer NOT NULL DEFAULT 1,
  payment_method text,
  amount numeric NOT NULL DEFAULT 0,
  memo text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  clinic_name text,
  staff_name text,
  payment_detail text,
  menu_name text
);

-- サブスク記録
CREATE TABLE IF NOT EXISTS public.subscription_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscription_master(id),
  subscription_name text,
  period_id uuid REFERENCES public.period_master(id),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  amount numeric NOT NULL DEFAULT 0,
  memo text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  clinic_name text,
  staff_name text,
  payment_detail text,
  menu_name text
);

-- 既存テーブルが CREATE IF NOT EXISTS でスキップされた場合: アプリが使う列をすべて補う
-- （VIEW 名が衝突している場合は BASE TABLE のみ対象。PostgREST の schema cache 用に NOTIFY も後段で行う）
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

CREATE INDEX IF NOT EXISTS idx_product_sales_sale_date ON public.product_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_product_sales_clinic_name ON public.product_sales(clinic_name);
CREATE INDEX IF NOT EXISTS idx_subscription_records_start_date ON public.subscription_records(start_date);
CREATE INDEX IF NOT EXISTS idx_subscription_records_clinic_name ON public.subscription_records(clinic_name);

ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_records ENABLE ROW LEVEL SECURITY;

/*
  ダッシュボードの「Run and enable RLS」や過去マイグレーションで付いたポリシー名が
  anon をカバーしないと INSERT で「violates row-level security」になる。
  public の該当テーブル上のポリシーをすべて削除してから、anon + authenticated で再作成する。
*/
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

-- PostgREST / API のスキーマキャッシュを更新（列追加直後の PGRST204 等の緩和）
NOTIFY pgrst, 'reload schema';
