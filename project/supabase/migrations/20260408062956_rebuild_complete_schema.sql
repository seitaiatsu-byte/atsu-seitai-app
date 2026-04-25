/*
  # 完全スキーマ再構築 - Excel全項目対応

  1. 顧客テーブル拡張
    - 基本情報: 氏名、かな、顧客番号、電話番号、生年月日、性別、年齢
    - 住所: 都道府県、市区町村、町名
    - LTV関連: 総LTV、年別LTV

  2. 来院記録テーブル拡張
    - 日付、患者ID、プログラム、金額、支払方法
    - 担当者、経路メモ×3種類
    - 院区別（川西 or 高槻）
    - Squareフラグ

  3. 物販記録テーブル拡張
    - 同様の項目を追加

  4. サブスク記録テーブル拡張
    - 同様の項目を追加

  5. 院マスターテーブル新設
    - 川西あつ整体院、高槻あつ整体院
*/

-- 既存テーブルに列を追加
DO $$
BEGIN
  -- customers テーブルに列を追加
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'birth_date') THEN
    ALTER TABLE customers ADD COLUMN birth_date date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'gender') THEN
    ALTER TABLE customers ADD COLUMN gender text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'age') THEN
    ALTER TABLE customers ADD COLUMN age integer;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'prefecture') THEN
    ALTER TABLE customers ADD COLUMN prefecture text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'city') THEN
    ALTER TABLE customers ADD COLUMN city text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address') THEN
    ALTER TABLE customers ADD COLUMN address text DEFAULT '';
  END IF;
  
  -- visit_records テーブルに列を追加
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'clinic_name') THEN
    ALTER TABLE visit_records ADD COLUMN clinic_name text DEFAULT '高槻あつ整体院';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'staff_name') THEN
    ALTER TABLE visit_records ADD COLUMN staff_name text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'route_memo_1') THEN
    ALTER TABLE visit_records ADD COLUMN route_memo_1 text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'route_memo_2') THEN
    ALTER TABLE visit_records ADD COLUMN route_memo_2 text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'route_memo_3') THEN
    ALTER TABLE visit_records ADD COLUMN route_memo_3 text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'is_square') THEN
    ALTER TABLE visit_records ADD COLUMN is_square boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visit_records' AND column_name = 'program_name') THEN
    ALTER TABLE visit_records ADD COLUMN program_name text DEFAULT '';
  END IF;
  
  -- product_sales テーブルに列を追加
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_sales' AND column_name = 'clinic_name') THEN
    ALTER TABLE product_sales ADD COLUMN clinic_name text DEFAULT '高槻あつ整体院';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_sales' AND column_name = 'staff_name') THEN
    ALTER TABLE product_sales ADD COLUMN staff_name text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_sales' AND column_name = 'product_name') THEN
    ALTER TABLE product_sales ADD COLUMN product_name text DEFAULT '';
  END IF;
  
  -- subscription_records テーブルに列を追加
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_records' AND column_name = 'clinic_name') THEN
    ALTER TABLE subscription_records ADD COLUMN clinic_name text DEFAULT '高槻あつ整体院';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_records' AND column_name = 'staff_name') THEN
    ALTER TABLE subscription_records ADD COLUMN staff_name text DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_records' AND column_name = 'subscription_name') THEN
    ALTER TABLE subscription_records ADD COLUMN subscription_name text DEFAULT '';
  END IF;
END $$;

-- 院マスターテーブルを作成
CREATE TABLE IF NOT EXISTS clinic_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clinic_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーは院マスターを参照可能"
  ON clinic_master FOR SELECT
  TO authenticated
  USING (true);

-- 院マスターの初期データ
INSERT INTO clinic_master (name, display_order, is_active) VALUES
  ('高槻あつ整体院', 1, true),
  ('川西あつ整体院', 2, true)
ON CONFLICT (name) DO NOTHING;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_visit_records_clinic_name ON visit_records(clinic_name);
CREATE INDEX IF NOT EXISTS idx_product_sales_clinic_name ON product_sales(clinic_name);
CREATE INDEX IF NOT EXISTS idx_subscription_records_clinic_name ON subscription_records(clinic_name);
CREATE INDEX IF NOT EXISTS idx_customers_birth_date ON customers(birth_date);
