/*
  # スタッフマスターと初期データ投入

  1. スタッフマスターテーブル作成
  2. 初期データ投入（プログラム、物販、サブスク、スタッフ）
*/

-- スタッフマスターテーブル
CREATE TABLE IF NOT EXISTS staff_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE staff_master ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'staff_master' 
    AND policyname = '認証済みユーザーはスタッフマスターを参照可能'
  ) THEN
    CREATE POLICY "認証済みユーザーはスタッフマスターを参照可能"
      ON staff_master FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'staff_master' 
    AND policyname = '認証済みユーザーはスタッフマスターを追加可能'
  ) THEN
    CREATE POLICY "認証済みユーザーはスタッフマスターを追加可能"
      ON staff_master FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'staff_master' 
    AND policyname = '認証済みユーザーはスタッフマスターを更新可能'
  ) THEN
    CREATE POLICY "認証済みユーザーはスタッフマスターを更新可能"
      ON staff_master FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'staff_master' 
    AND policyname = '認証済みユーザーはスタッフマスターを削除可能'
  ) THEN
    CREATE POLICY "認証済みユーザーはスタッフマスターを削除可能"
      ON staff_master FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 初期データ投入
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM program_master WHERE name = '都度払い') THEN
    INSERT INTO program_master (name, price, category, display_order) VALUES
      ('都度払い', 5000, '都度払い', 1),
      ('回数券（5回）', 22500, '回数券', 2),
      ('回数券（10回）', 42000, '回数券', 3),
      ('3Mプログラム', 150000, 'プログラム', 4),
      ('6Mプログラム', 280000, 'プログラム', 5),
      ('10Mプログラム', 450000, 'プログラム', 6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM product_master WHERE name = 'サプリメント') THEN
    INSERT INTO product_master (name, price, display_order) VALUES
      ('サプリメント', 3000, 1),
      ('姿勢矯正ベルト', 5500, 2),
      ('健康枕', 8000, 3);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM subscription_master WHERE name = '月額サブスク（通い放題）') THEN
    INSERT INTO subscription_master (name, price, display_order) VALUES
      ('月額サブスク（通い放題）', 50000, 1),
      ('月額サブスク（週1回）', 20000, 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM staff_master WHERE name = 'あつ') THEN
    INSERT INTO staff_master (name, display_order) VALUES
      ('あつ', 1),
      ('スタッフA', 2),
      ('スタッフB', 3);
  END IF;
END $$;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_staff_master_active ON staff_master(is_active, display_order);
