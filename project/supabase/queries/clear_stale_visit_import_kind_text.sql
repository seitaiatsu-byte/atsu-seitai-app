-- 来院記録: 取込の「種類」列(import_kind_text)が残り、画面修正が反映されない行の一括クリア
-- ※ payment_detail_id を既に設定している行だけ。実行前に結果プレビューを確認してください。

-- プレビュー（何件消えるか）
SELECT COUNT(*) AS 対象件数
FROM visit_records
WHERE import_kind_text IS NOT NULL
  AND trim(import_kind_text) <> ''
  AND payment_detail_id IS NOT NULL;

-- 実行（コメントを外して Run）
-- UPDATE visit_records
-- SET import_kind_text = NULL
-- WHERE import_kind_text IS NOT NULL
--   AND trim(import_kind_text) <> ''
--   AND payment_detail_id IS NOT NULL;
