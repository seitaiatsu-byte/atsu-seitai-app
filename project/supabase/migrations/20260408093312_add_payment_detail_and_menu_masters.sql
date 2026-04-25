/*
  # 決済内容マスターとメニューマスターの追加

  1. 新規テーブル
    - `payment_detail_master` (決済内容マスター)
      - `id` (uuid, primary key)
      - `name` (text) - 決済内容名（頭金、残金、一括など）
      - `display_order` (integer) - 表示順序
      - `is_active` (boolean) - 有効/無効
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `menu_master` (メニューマスター)
      - `id` (uuid, primary key)
      - `name` (text) - メニュー名
      - `category` (text) - カテゴリ（施術、物販、サブスクなど）
      - `display_order` (integer) - 表示順序
      - `is_active` (boolean) - 有効/無効
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. 既存テーブルへのカラム追加
    - `visit_records`, `product_sales`, `subscription_records` に以下を追加:
      - `payment_detail` (text) - 決済内容
      - `menu_name` (text) - メニュー名

  3. セキュリティ
    - 各テーブルにRLSを有効化
    - 匿名ユーザーでも読み取り可能なポリシーを設定

  4. 初期データ
    - 決済内容マスターに基本的な決済内容を登録
    - メニューマスターにサンプルメニューを登録
*/

-- 決済内容マスターテーブル作成
CREATE TABLE IF NOT EXISTS payment_detail_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- メニューマスターテーブル作成
CREATE TABLE IF NOT EXISTS menu_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text DEFAULT '施術',
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 既存テーブルにカラム追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visit_records' AND column_name = 'payment_detail'
  ) THEN
    ALTER TABLE visit_records ADD COLUMN payment_detail text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visit_records' AND column_name = 'menu_name'
  ) THEN
    ALTER TABLE visit_records ADD COLUMN menu_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_sales' AND column_name = 'payment_detail'
  ) THEN
    ALTER TABLE product_sales ADD COLUMN payment_detail text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_sales' AND column_name = 'menu_name'
  ) THEN
    ALTER TABLE product_sales ADD COLUMN menu_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_records' AND column_name = 'payment_detail'
  ) THEN
    ALTER TABLE subscription_records ADD COLUMN payment_detail text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_records' AND column_name = 'menu_name'
  ) THEN
    ALTER TABLE subscription_records ADD COLUMN menu_name text;
  END IF;
END $$;

-- RLS有効化
ALTER TABLE payment_detail_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_master ENABLE ROW LEVEL SECURITY;

-- 決済内容マスターのポリシー
CREATE POLICY "Anyone can read payment_detail_master"
  ON payment_detail_master FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert payment_detail_master"
  ON payment_detail_master FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update payment_detail_master"
  ON payment_detail_master FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- メニューマスターのポリシー
CREATE POLICY "Anyone can read menu_master"
  ON menu_master FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert menu_master"
  ON menu_master FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update menu_master"
  ON menu_master FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 初期データ挿入：決済内容マスター
INSERT INTO payment_detail_master (name, display_order, is_active)
VALUES
  ('一括', 1, true),
  ('頭金', 2, true),
  ('残金', 3, true),
  ('分割', 4, true)
ON CONFLICT DO NOTHING;

-- 初期データ挿入：メニューマスター
INSERT INTO menu_master (name, category, display_order, is_active)
VALUES
  ('骨盤矯正', '施術', 1, true),
  ('全身調整', '施術', 2, true),
  ('姿勢改善', '施術', 3, true),
  ('産後ケア', '施術', 4, true),
  ('EMS', 'オプション', 5, true),
  ('鍼灸', 'オプション', 6, true)
ON CONFLICT DO NOTHING;