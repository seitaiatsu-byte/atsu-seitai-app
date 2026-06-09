-- 来院ごとの実施枠時間（分単価計算用）
ALTER TABLE visit_records
  ADD COLUMN IF NOT EXISTS treatment_minutes integer;

COMMENT ON COLUMN visit_records.treatment_minutes IS 'その来院で実際に取った施術枠時間（分）。来院入力で記録。';
