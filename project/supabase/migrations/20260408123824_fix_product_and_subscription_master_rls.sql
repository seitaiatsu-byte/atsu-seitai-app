/*
  # 物販マスターとサブスクマスターのRLSポリシー修正

  ## 問題
  - product_master と subscription_master のRLSポリシーが authenticated ユーザーのみに設定されている
  - このアプリは認証なしで動作するため anon ユーザーもアクセスできる必要がある

  ## 変更内容
  - 既存のポリシーを削除
  - anon と authenticated の両方がアクセスできる新しいポリシーを作成
  
  ## セキュリティ
  - SELECT: anon と authenticated の両方が参照可能
  - INSERT/UPDATE/DELETE: anon と authenticated の両方が操作可能（管理画面のため）
*/

-- product_master のポリシー削除と再作成
DROP POLICY IF EXISTS "認証済みユーザーは物販マスターを参照可能" ON product_master;
DROP POLICY IF EXISTS "認証済みユーザーは物販マスターを登録可能" ON product_master;
DROP POLICY IF EXISTS "認証済みユーザーは物販マスターを更新可能" ON product_master;
DROP POLICY IF EXISTS "認証済みユーザーは物販マスターを削除可能" ON product_master;

CREATE POLICY "全ユーザーは物販マスターを参照可能"
  ON product_master
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "全ユーザーは物販マスターを登録可能"
  ON product_master
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "全ユーザーは物販マスターを更新可能"
  ON product_master
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "全ユーザーは物販マスターを削除可能"
  ON product_master
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- subscription_master のポリシー削除と再作成
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを参照可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを登録可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを更新可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを削除可" ON subscription_master;

CREATE POLICY "全ユーザーはサブスクマスターを参照可能"
  ON subscription_master
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "全ユーザーはサブスクマスターを登録可能"
  ON subscription_master
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "全ユーザーはサブスクマスターを更新可能"
  ON subscription_master
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "全ユーザーはサブスクマスターを削除可能"
  ON subscription_master
  FOR DELETE
  TO anon, authenticated
  USING (true);
