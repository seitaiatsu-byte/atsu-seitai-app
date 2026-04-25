-- 支払方法・決済内容マスタの表示名を運用定義に寄せる（既存名の正規化と不足分の追加）

-- 支払方法: カード表記を統一
UPDATE payment_method_master
SET name = 'クレジットカード'
WHERE name IN ('カード', 'CARD', 'card');

-- PayPay が無ければ追加
INSERT INTO payment_method_master (name, display_order, is_active)
SELECT 'PayPay', COALESCE((SELECT MAX(display_order) FROM payment_method_master), 0) + 1, true
WHERE NOT EXISTS (SELECT 1 FROM payment_method_master WHERE lower(trim(name)) = 'paypay');

-- その他 が無ければ追加（初期マイグレに含まれる場合はスキップ）
INSERT INTO payment_method_master (name, display_order, is_active)
SELECT 'その他', COALESCE((SELECT MAX(display_order) FROM payment_method_master), 0) + 1, true
WHERE NOT EXISTS (SELECT 1 FROM payment_method_master WHERE trim(name) = 'その他');

-- 決済内容: 運用で使う代表値（同名が無い場合のみ追加）
DO $$
DECLARE
  mx int;
BEGIN
  SELECT COALESCE(MAX(display_order), 0) INTO mx FROM payment_detail_master;

  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '事前精算') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('事前精算', mx, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '当日精算') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('当日精算', mx, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '事前精算＋当日精算') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('事前精算＋当日精算', mx, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '物販') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('物販', mx, true);
  END IF;
END $$;
