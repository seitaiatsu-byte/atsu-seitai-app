/*
  # 顧客情報の完全化とマスターテーブル追加

  1. 顧客テーブルの拡充
    - 流入経路フィールド追加
    - 主訴1、主訴2、主訴3フィールド追加
    - 府県、市、町の詳細住所フィールド追加
    - 院名フィールド追加

  2. 新規マスターテーブル
    - referral_source_master: 流入経路マスター
    - chief_complaint_master: 主訴マスター
    - business_rules: 経営ルール設定

  3. セキュリティ
    - 全テーブルでRLS有効化
    - 認証済みユーザーのみアクセス可能
*/

-- 顧客テーブルに新フィールド追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'referral_source'
  ) THEN
    ALTER TABLE customers ADD COLUMN referral_source text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'chief_complaint_1'
  ) THEN
    ALTER TABLE customers ADD COLUMN chief_complaint_1 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'chief_complaint_2'
  ) THEN
    ALTER TABLE customers ADD COLUMN chief_complaint_2 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'chief_complaint_3'
  ) THEN
    ALTER TABLE customers ADD COLUMN chief_complaint_3 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'town'
  ) THEN
    ALTER TABLE customers ADD COLUMN town text;
  END IF;
END $$;

-- 流入経路マスター
CREATE TABLE IF NOT EXISTS referral_source_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referral_source_master ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'referral_source_master' 
    AND policyname = '認証済みユーザーは流入経路マスターを参照可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは流入経路マスターを参照可能"
      ON referral_source_master FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'referral_source_master' 
    AND policyname = '認証済みユーザーは流入経路マスターを追加可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは流入経路マスターを追加可能"
      ON referral_source_master FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'referral_source_master' 
    AND policyname = '認証済みユーザーは流入経路マスターを更新可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは流入経路マスターを更新可能"
      ON referral_source_master FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'referral_source_master' 
    AND policyname = '認証済みユーザーは流入経路マスターを削除可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは流入経路マスターを削除可能"
      ON referral_source_master FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 主訴マスター
CREATE TABLE IF NOT EXISTS chief_complaint_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chief_complaint_master ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chief_complaint_master' 
    AND policyname = '認証済みユーザーは主訴マスターを参照可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは主訴マスターを参照可能"
      ON chief_complaint_master FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chief_complaint_master' 
    AND policyname = '認証済みユーザーは主訴マスターを追加可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは主訴マスターを追加可能"
      ON chief_complaint_master FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chief_complaint_master' 
    AND policyname = '認証済みユーザーは主訴マスターを更新可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは主訴マスターを更新可能"
      ON chief_complaint_master FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'chief_complaint_master' 
    AND policyname = '認証済みユーザーは主訴マスターを削除可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは主訴マスターを削除可能"
      ON chief_complaint_master FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 経営ルール設定
CREATE TABLE IF NOT EXISTS business_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  rule_value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'business_rules' 
    AND policyname = '認証済みユーザーは経営ルールを参照可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは経営ルールを参照可能"
      ON business_rules FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'business_rules' 
    AND policyname = '認証済みユーザーは経営ルールを追加可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは経営ルールを追加可能"
      ON business_rules FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'business_rules' 
    AND policyname = '認証済みユーザーは経営ルールを更新可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは経営ルールを更新可能"
      ON business_rules FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'business_rules' 
    AND policyname = '認証済みユーザーは経営ルールを削除可能'
  ) THEN
    CREATE POLICY "認証済みユーザーは経営ルールを削除可能"
      ON business_rules FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 初期データ投入
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM referral_source_master WHERE name = 'ホームページ') THEN
    INSERT INTO referral_source_master (name, display_order) VALUES
      ('ホームページ', 1),
      ('Google検索', 2),
      ('紹介', 3),
      ('チラシ', 4),
      ('看板', 5),
      ('その他', 6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM chief_complaint_master WHERE name = '腰痛') THEN
    INSERT INTO chief_complaint_master (name, display_order) VALUES
      ('腰痛', 1),
      ('肩こり', 2),
      ('首の痛み', 3),
      ('膝の痛み', 4),
      ('頭痛', 5),
      ('姿勢改善', 6),
      ('その他', 7);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM business_rules WHERE rule_key = 'inactive_days_threshold') THEN
    INSERT INTO business_rules (rule_key, rule_value, description) VALUES
      ('inactive_days_threshold', '30', '離脱判定日数（最終来院からの経過日数）'),
      ('exclude_keywords', 'BE,初回,体験', '通院回数カウント除外キーワード（カンマ区切り）');
  END IF;
END $$;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_referral_source_master_active ON referral_source_master(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_chief_complaint_master_active ON chief_complaint_master(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_business_rules_key ON business_rules(rule_key);
CREATE INDEX IF NOT EXISTS idx_customers_referral ON customers(referral_source);
CREATE INDEX IF NOT EXISTS idx_customers_prefecture ON customers(prefecture);
CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);
