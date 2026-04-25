/*
  匿名キー（anon）で動作するアプリのため、以下マスタで INSERT/UPDATE/DELETE/SELECT を
  anon と authenticated の両方に許可する。

  - referral_source_master: 81123 で authenticated のみになっていた
  - payment_detail_master: 93312 / 95008 のポリシー名混在を整理
  - subscription_master: 23824 と整合（ポリシー名の揺れも DROP で吸収）

  ダッシュボードで手動適用済みの場合も、supabase db push 等で再実行できるよう
  末尾の「全ユーザーは…」ポリシーも DROP IF EXISTS してから CREATE する（冪等）。
*/

-- ========== referral_source_master ==========
DROP POLICY IF EXISTS "認証済みユーザーは流入経路マスターを参照可能" ON referral_source_master;
DROP POLICY IF EXISTS "認証済みユーザーは流入経路マスターを追加可能" ON referral_source_master;
DROP POLICY IF EXISTS "認証済みユーザーは流入経路マスターを更新可能" ON referral_source_master;
DROP POLICY IF EXISTS "認証済みユーザーは流入経路マスターを削除可能" ON referral_source_master;
DROP POLICY IF EXISTS "全ユーザーは流入経路マスターを参照可能" ON referral_source_master;
DROP POLICY IF EXISTS "全ユーザーは流入経路マスターを登録可能" ON referral_source_master;
DROP POLICY IF EXISTS "全ユーザーは流入経路マスターを更新可能" ON referral_source_master;
DROP POLICY IF EXISTS "全ユーザーは流入経路マスターを削除可能" ON referral_source_master;

CREATE POLICY "全ユーザーは流入経路マスターを参照可能"
  ON referral_source_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "全ユーザーは流入経路マスターを登録可能"
  ON referral_source_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "全ユーザーは流入経路マスターを更新可能"
  ON referral_source_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "全ユーザーは流入経路マスターを削除可能"
  ON referral_source_master FOR DELETE TO anon, authenticated USING (true);

-- ========== payment_detail_master ==========
DROP POLICY IF EXISTS "Anyone can read payment_detail_master" ON payment_detail_master;
DROP POLICY IF EXISTS "Anyone can insert payment_detail_master" ON payment_detail_master;
DROP POLICY IF EXISTS "Anyone can update payment_detail_master" ON payment_detail_master;
DROP POLICY IF EXISTS "Allow anonymous access to payment details" ON payment_detail_master;
DROP POLICY IF EXISTS "全ユーザーは決済内容マスターを参照可能" ON payment_detail_master;
DROP POLICY IF EXISTS "全ユーザーは決済内容マスターを登録可能" ON payment_detail_master;
DROP POLICY IF EXISTS "全ユーザーは決済内容マスターを更新可能" ON payment_detail_master;
DROP POLICY IF EXISTS "全ユーザーは決済内容マスターを削除可能" ON payment_detail_master;

CREATE POLICY "全ユーザーは決済内容マスターを参照可能"
  ON payment_detail_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "全ユーザーは決済内容マスターを登録可能"
  ON payment_detail_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "全ユーザーは決済内容マスターを更新可能"
  ON payment_detail_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "全ユーザーは決済内容マスターを削除可能"
  ON payment_detail_master FOR DELETE TO anon, authenticated USING (true);

-- ========== subscription_master ==========
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを参照可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを登録可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを更新可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを削除可" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを参照可能" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを登録可能" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを更新可能" ON subscription_master;
DROP POLICY IF EXISTS "認証済みユーザーはサブスクマスターを削除可能" ON subscription_master;
DROP POLICY IF EXISTS "全ユーザーはサブスクマスターを参照可能" ON subscription_master;
DROP POLICY IF EXISTS "全ユーザーはサブスクマスターを登録可能" ON subscription_master;
DROP POLICY IF EXISTS "全ユーザーはサブスクマスターを更新可能" ON subscription_master;
DROP POLICY IF EXISTS "全ユーザーはサブスクマスターを削除可能" ON subscription_master;

CREATE POLICY "全ユーザーはサブスクマスターを参照可能"
  ON subscription_master FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "全ユーザーはサブスクマスターを登録可能"
  ON subscription_master FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "全ユーザーはサブスクマスターを更新可能"
  ON subscription_master FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "全ユーザーはサブスクマスターを削除可能"
  ON subscription_master FOR DELETE TO anon, authenticated USING (true);
