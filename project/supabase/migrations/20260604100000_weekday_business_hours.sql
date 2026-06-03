/*
  予約カレンダー Vac. 用：曜日ごとの営業開始・終了
  weekday: 0=日 … 6=土（JavaScript Date.getDay() と同じ）
*/

CREATE TABLE IF NOT EXISTS public.weekday_business_hours (
  weekday smallint PRIMARY KEY CHECK (weekday >= 0 AND weekday <= 6),
  label text NOT NULL,
  start_time text NOT NULL DEFAULT '10:00',
  end_time text NOT NULL DEFAULT '20:00',
  is_open boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.weekday_business_hours ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekday_business_hours TO anon, authenticated, service_role;

DROP POLICY IF EXISTS app_weekday_business_hours_select ON public.weekday_business_hours;
DROP POLICY IF EXISTS app_weekday_business_hours_insert ON public.weekday_business_hours;
DROP POLICY IF EXISTS app_weekday_business_hours_update ON public.weekday_business_hours;
DROP POLICY IF EXISTS app_weekday_business_hours_delete ON public.weekday_business_hours;

CREATE POLICY app_weekday_business_hours_select ON public.weekday_business_hours
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY app_weekday_business_hours_insert ON public.weekday_business_hours
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY app_weekday_business_hours_update ON public.weekday_business_hours
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_weekday_business_hours_delete ON public.weekday_business_hours
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.weekday_business_hours (weekday, label, start_time, end_time, is_open)
VALUES
  (0, '日曜', '10:00', '18:00', false),
  (1, '月曜', '10:00', '20:00', true),
  (2, '火曜', '10:00', '20:00', true),
  (3, '水曜', '10:00', '20:00', true),
  (4, '木曜', '10:00', '20:00', true),
  (5, '金曜', '10:00', '20:00', true),
  (6, '土曜', '10:00', '20:00', true)
ON CONFLICT (weekday) DO NOTHING;

NOTIFY pgrst, 'reload schema';
