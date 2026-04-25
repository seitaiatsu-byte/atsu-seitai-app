/*
  # 顧客テーブルにメモフィールド追加

  1. 変更内容
    - customersテーブルに`memo`カラム（テキスト型、NULL許可）を追加
    - 顧客の特記事項や申し送り事項を記録するため

  2. 注意事項
    - 既存データに影響なし（NULL許可のため）
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'memo'
  ) THEN
    ALTER TABLE customers ADD COLUMN memo text;
  END IF;
END $$;
