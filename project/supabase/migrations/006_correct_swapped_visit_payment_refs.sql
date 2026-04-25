-- 来院記録で「支払方法」列に決済内容マスタUUID、「payment_detail_id」に支払方法マスタUUIDが
-- 入れ替わって保存されているケースを検出して入れ替え修正する（該当行のみ）。

-- 1) payment_method が決済内容マスタの id を指し、payment_detail_id が支払方法マスタを指す → 交換
UPDATE visit_records vr
SET
  payment_method = vr.payment_detail_id::text,
  payment_detail_id = NULLIF(btrim(vr.payment_method), '')::uuid
WHERE NULLIF(btrim(vr.payment_method), '') IS NOT NULL
  AND btrim(vr.payment_method) ~* '^[0-9a-f-]{36}$'
  AND vr.payment_detail_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM payment_detail_master d WHERE d.id::text = btrim(vr.payment_method))
  AND EXISTS (SELECT 1 FROM payment_method_master m WHERE m.id = vr.payment_detail_id);

-- 2) payment_method のみが誤って決済内容マスタUUIDで、payment_detail_id が NULL → 列を正しい側へ移動
UPDATE visit_records vr
SET
  payment_detail_id = NULLIF(btrim(vr.payment_method), '')::uuid,
  payment_method = NULL
WHERE NULLIF(btrim(vr.payment_method), '') IS NOT NULL
  AND btrim(vr.payment_method) ~* '^[0-9a-f-]{36}$'
  AND vr.payment_detail_id IS NULL
  AND EXISTS (SELECT 1 FROM payment_detail_master d WHERE d.id::text = btrim(vr.payment_method))
  AND NOT EXISTS (SELECT 1 FROM payment_method_master m WHERE m.id::text = btrim(vr.payment_method));
