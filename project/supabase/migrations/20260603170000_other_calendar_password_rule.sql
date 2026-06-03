/*
  予約以外（院長個人予定）タブ用パスワード
  初回は空。経営ルール設定画面で設定するか、VITE_OTHER_CALENDAR_PASSWORD を使う。
*/

INSERT INTO public.business_rules (rule_key, rule_value, description)
SELECT
  'other_calendar_password',
  '',
  '予約カレンダー「予約以外」タブの入室パスワード（平文・要変更）'
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_rules WHERE rule_key = 'other_calendar_password'
);

NOTIFY pgrst, 'reload schema';
