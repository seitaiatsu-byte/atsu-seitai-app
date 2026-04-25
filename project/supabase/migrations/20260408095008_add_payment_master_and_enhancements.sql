/*
  # 支払い方法マスター・ポイント・メディア機能追加

  1. 新規テーブル
    - `payment_method_master` (支払い方法マスター)
      - `id` (uuid, primary key)
      - `name` (text, 支払い方法名)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `menu_master` (実施メニューマスター)
      - `id` (uuid, primary key)
      - `name` (text)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `payment_detail_master` (決済内容マスター - 既存を確認して作成)
      - `id` (uuid, primary key)
      - `name` (text)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. 既存テーブル変更
    - `customers`テーブル
      - `points` (integer, デフォルト0) 追加
    
    - `visit_records`テーブル
      - `route_memo1`, `route_memo2`, `route_memo3`, `is_square` 削除
      - `menu_id` (uuid, menu_masterへの外部キー) 追加
      - `payment_detail_id` (uuid, payment_detail_masterへの外部キー) 追加
      - `points_used` (integer, デフォルト0) 追加
      - `media_urls` (text[], 画像・動画のURL配列) 追加

  3. セキュリティ
    - 全テーブルにRLSを有効化
    - 匿名ユーザーが全操作できるポリシーを追加

  4. 初期データ
    - 支払い方法マスターに「現金」「カード」「その他」を登録
*/

CREATE TABLE IF NOT EXISTS payment_method_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'payment_detail_master'
  ) THEN
    CREATE TABLE payment_detail_master (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      display_order integer DEFAULT 0,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' AND column_name = 'points'
  ) THEN
    ALTER TABLE customers ADD COLUMN points integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'route_memo1'
  ) THEN
    ALTER TABLE visit_records DROP COLUMN route_memo1;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'route_memo2'
  ) THEN
    ALTER TABLE visit_records DROP COLUMN route_memo2;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'route_memo3'
  ) THEN
    ALTER TABLE visit_records DROP COLUMN route_memo3;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'is_square'
  ) THEN
    ALTER TABLE visit_records DROP COLUMN is_square;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'menu_id'
  ) THEN
    ALTER TABLE visit_records ADD COLUMN menu_id uuid REFERENCES menu_master(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'payment_detail_id'
  ) THEN
    ALTER TABLE visit_records ADD COLUMN payment_detail_id uuid REFERENCES payment_detail_master(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'points_used'
  ) THEN
    ALTER TABLE visit_records ADD COLUMN points_used integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visit_records' AND column_name = 'media_urls'
  ) THEN
    ALTER TABLE visit_records ADD COLUMN media_urls text[] DEFAULT ARRAY[]::text[];
  END IF;
END $$;

ALTER TABLE payment_method_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_detail_master ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'payment_method_master' AND policyname = 'Allow anonymous access to payment methods'
  ) THEN
    CREATE POLICY "Allow anonymous access to payment methods"
      ON payment_method_master FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'menu_master' AND policyname = 'Allow anonymous access to menus'
  ) THEN
    CREATE POLICY "Allow anonymous access to menus"
      ON menu_master FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'payment_detail_master' AND policyname = 'Allow anonymous access to payment details'
  ) THEN
    CREATE POLICY "Allow anonymous access to payment details"
      ON payment_detail_master FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

INSERT INTO payment_method_master (name, display_order) VALUES
  ('現金', 1),
  ('カード', 2),
  ('その他', 3)
ON CONFLICT DO NOTHING;
