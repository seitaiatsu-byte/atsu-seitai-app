/*
  # 物販・サブスク: anon で INSERT できるよう RLS を確実にする

  20260502140000 適用後でも、SQL Editor の「Run and enable RLS」などで
  anon を含まないポリシーだけが残ると「violates row-level security」になる。
  既に product_sales / subscription_records がある前提で、ポリシーを全削除して作り直す。
*/

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
