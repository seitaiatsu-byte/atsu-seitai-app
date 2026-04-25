/*
  # 高槲あつ整体院 爆速管理システム - 初期スキーマ

  1. 新規テーブル
    - `customers` (顧客名簿)
    - `program_master` (プログラムマスター: 6M/3M/10-12M等)
    - `product_master` (物販マスター)
    - `subscription_master` (サブスクマスター)
    - `visit_records` (来院記録)
    - `product_sales` (物販記録)
    - `subscription_records` (サブスク記録)

  2. セキュリティ
    - 全テーブルでRLSを有効化
    - 認証済みユーザーのみアクセス可能なポリシーを設定
*/

-- 顧客名簿テーブル
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_kana text NOT NULL,
  phone_number text DEFAULT '',
  customer_number text DEFAULT '',
  email text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーは顧客を参照可能"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーは顧客を登録可能"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーは顧客を更新可能"
  ON customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- プログラムマスターテーブル
CREATE TABLE IF NOT EXISTS program_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE program_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーはプログラムマスターを参照可能"
  ON program_master FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーはプログラムマスターを登録可能"
  ON program_master FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーはプログラムマスターを更新可能"
  ON program_master FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーはプログラムマスターを削除可能"
  ON program_master FOR DELETE
  TO authenticated
  USING (true);

-- 物販マスターテーブル
CREATE TABLE IF NOT EXISTS product_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーは物販マスターを参照可能"
  ON product_master FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーは物販マスターを登録可能"
  ON product_master FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーは物販マスターを更新可能"
  ON product_master FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーは物販マスターを削除可能"
  ON product_master FOR DELETE
  TO authenticated
  USING (true);

-- サブスクマスターテーブル
CREATE TABLE IF NOT EXISTS subscription_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーはサブスクマスターを参照可能"
  ON subscription_master FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーはサブスクマスターを登録可能"
  ON subscription_master FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーはサブスクマスターを更新可能"
  ON subscription_master FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーはサブスクマスターを削除可能"
  ON subscription_master FOR DELETE
  TO authenticated
  USING (true);

-- 来院記録テーブル
CREATE TABLE IF NOT EXISTS visit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  program_id uuid REFERENCES program_master(id),
  payment_method text NOT NULL DEFAULT '現金',
  amount numeric NOT NULL DEFAULT 0,
  memo text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE visit_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーは来院記録を参照可能"
  ON visit_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーは来院記録を登録可能"
  ON visit_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 物販記録テーブル
CREATE TABLE IF NOT EXISTS product_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  product_id uuid REFERENCES product_master(id),
  quantity integer NOT NULL DEFAULT 1,
  payment_method text NOT NULL DEFAULT '現金',
  amount numeric NOT NULL DEFAULT 0,
  memo text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーは物販記録を参照可能"
  ON product_sales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーは物販記録を登録可能"
  ON product_sales FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- サブスク記録テーブル
CREATE TABLE IF NOT EXISTS subscription_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscription_master(id),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT '現金',
  amount numeric NOT NULL DEFAULT 0,
  memo text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーはサブスク記録を参照可能"
  ON subscription_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "認証済みユーザーはサブスク記録を登録可能"
  ON subscription_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- インデックスの作成（高速検索のため）
CREATE INDEX IF NOT EXISTS idx_customers_name_kana ON customers(name_kana);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_visit_records_visit_date ON visit_records(visit_date);
CREATE INDEX IF NOT EXISTS idx_product_sales_sale_date ON product_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_subscription_records_start_date ON subscription_records(start_date);
