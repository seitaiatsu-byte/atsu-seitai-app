-- あつ整体院管理アプリ拡張（Supabase SQL エディタまたは migration で実行）

-- business_rules: rule_key ユニーク（upsert 用）
CREATE TABLE IF NOT EXISTS public.business_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  rule_value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- 期間マスタ（サブスク）
CREATE TABLE IF NOT EXISTS public.period_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- customers 拡張列（既にあればスキップ）
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS age int;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS town text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS chief_complaint_1 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS chief_complaint_2 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS chief_complaint_3 text;

-- visit_records.menu_name（実施メニュー名のスナップショット）
ALTER TABLE public.visit_records ADD COLUMN IF NOT EXISTS menu_name text;

-- product_sales.product_name
ALTER TABLE public.product_sales ADD COLUMN IF NOT EXISTS product_name text;

-- subscription_records 拡張
ALTER TABLE public.subscription_records ADD COLUMN IF NOT EXISTS subscription_name text;
ALTER TABLE public.subscription_records ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.period_master(id);

-- 任意: 初期ルール
INSERT INTO public.business_rules (rule_key, rule_value, description)
VALUES
  ('inactive_days_threshold', '30', '離脱アラート基準（日）'),
  ('exclude_keywords', 'BE,初回,体験', 'リピートカウント除外キーワード'),
  ('churn_lapsed_days', '90', '離患判定経過日数')
ON CONFLICT (rule_key) DO NOTHING;
