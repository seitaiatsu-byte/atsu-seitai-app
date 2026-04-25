/*
  # RLSポリシー修正 - 匿名アクセス許可

  1. 変更内容
    - customersテーブルの既存ポリシーを削除
    - 匿名ユーザー(anon)と認証済みユーザー(authenticated)の両方にアクセス許可
    - INSERT、SELECT、UPDATE、DELETE全ての操作を許可

  2. セキュリティについて
    - 開発環境用の設定
    - 本番環境では適切な認証とポリシーの見直しが必要

  3. 理由
    - CSVインポート機能が認証なしで動作する必要がある
    - Row Level Security (RLS) エラーの解消
*/

DROP POLICY IF EXISTS "認証済みユーザーは顧客を参照可能" ON customers;
DROP POLICY IF EXISTS "認証済みユーザーは顧客を更新可能" ON customers;
DROP POLICY IF EXISTS "認証済みユーザーは顧客を登録可能" ON customers;

CREATE POLICY "全ユーザーは顧客を参照可能"
  ON customers
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "全ユーザーは顧客を登録可能"
  ON customers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "全ユーザーは顧客を更新可能"
  ON customers
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "全ユーザーは顧客を削除可能"
  ON customers
  FOR DELETE
  TO anon, authenticated
  USING (true);
