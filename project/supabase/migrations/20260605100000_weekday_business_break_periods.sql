/*
  曜日営業時間：休憩（予約不可）枠
  break_periods: [{"start_time":"12:00","end_time":"13:00"}, ...]
*/

ALTER TABLE public.weekday_business_hours
  ADD COLUMN IF NOT EXISTS break_periods jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
