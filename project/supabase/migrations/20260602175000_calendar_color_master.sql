/*
  予約カレンダー表示色マスター
  - match_text: 予約の表示文字・メモなどに含まれるキーワード
  - color_key: red / purple / amber / blue / green / slate / teal
*/

CREATE TABLE IF NOT EXISTS public.calendar_color_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  match_text text NOT NULL,
  color_key text NOT NULL DEFAULT 'red',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT calendar_color_master_color_key_check
    CHECK (color_key IN ('red', 'purple', 'amber', 'blue', 'green', 'slate', 'teal'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_color_master_order
  ON public.calendar_color_master (display_order);

ALTER TABLE public.calendar_color_master ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_color_master TO anon, authenticated, service_role;

DROP POLICY IF EXISTS app_calendar_color_master_select ON public.calendar_color_master;
DROP POLICY IF EXISTS app_calendar_color_master_insert ON public.calendar_color_master;
DROP POLICY IF EXISTS app_calendar_color_master_update ON public.calendar_color_master;
DROP POLICY IF EXISTS app_calendar_color_master_delete ON public.calendar_color_master;

CREATE POLICY app_calendar_color_master_select ON public.calendar_color_master
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY app_calendar_color_master_insert ON public.calendar_color_master
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY app_calendar_color_master_update ON public.calendar_color_master
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_calendar_color_master_delete ON public.calendar_color_master
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.calendar_color_master (name, match_text, color_key, display_order, is_active)
VALUES
  ('新規', '新規', 'red', 1, true),
  ('プログラム', 'プログラム', 'purple', 2, true),
  ('回数券', '回数券', 'amber', 3, true)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
