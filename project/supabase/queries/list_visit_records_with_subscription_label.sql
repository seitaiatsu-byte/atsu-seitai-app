-- 来院記録のうち、旧売上集計で「サブスク」列に入っていた候補（金額あり）
-- Supabase → SQL Editor → New query → 貼り付け → Run

SELECT
  v.visit_date AS 来院日,
  c.customer_number AS 顧客番号,
  c.name AS 氏名,
  v.amount AS 金額,
  v.menu_name AS メニュー,
  v.import_kind_text AS 種類,
  LEFT(v.memo, 80) AS メモ,
  pd.name AS 支払種類マスタ,
  v.clinic_name AS 院,
  v.staff_name AS 担当,
  v.id AS 来院記録ID
FROM visit_records v
LEFT JOIN customers c ON c.id = v.customer_id
LEFT JOIN payment_detail_master pd ON pd.id = v.payment_detail_id
WHERE COALESCE(v.amount, 0) <> 0
  AND (
    COALESCE(v.menu_name, '') ILIKE '%サブスク%'
    OR COALESCE(v.menu_name, '') ILIKE '%定期%'
    OR COALESCE(v.menu_name, '') ILIKE '%subscription%'
    OR COALESCE(v.import_kind_text, '') ILIKE '%サブスク%'
    OR COALESCE(v.import_kind_text, '') ILIKE '%定期%'
    OR COALESCE(v.import_kind_text, '') ILIKE '%subscription%'
    OR COALESCE(v.memo, '') ILIKE '%サブスク%'
    OR COALESCE(v.memo, '') ILIKE '%定期%'
    OR COALESCE(v.memo, '') ILIKE '%subscription%'
    OR COALESCE(pd.name, '') ILIKE '%サブスク%'
    OR COALESCE(pd.name, '') ILIKE '%定期%'
    OR COALESCE(pd.name, '') ILIKE '%subscription%'
  )
ORDER BY v.visit_date DESC, c.customer_number NULLS LAST;
