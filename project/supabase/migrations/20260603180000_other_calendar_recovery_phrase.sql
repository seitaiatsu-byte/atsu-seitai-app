/*
  予約以外タブ：パスワード忘れ用の合言葉（経営ルール設定で登録）
*/

INSERT INTO public.business_rules (rule_key, rule_value, description)
SELECT
  'other_calendar_recovery_phrase',
  '',
  '予約カレンダー「予約以外」タブ：パスワード確認用の合言葉'
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_rules WHERE rule_key = 'other_calendar_recovery_phrase'
);

NOTIFY pgrst, 'reload schema';
