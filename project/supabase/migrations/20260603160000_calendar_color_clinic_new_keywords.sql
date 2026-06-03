/*
  予約メモの院別キーワード（新規高槻＝赤、新規川西＝紫）
  display_order を小さいほど先にマッチ
*/

INSERT INTO public.calendar_color_master (name, match_text, color_key, display_order, is_active)
SELECT v.name, v.match_text, v.color_key, v.display_order, true
FROM (VALUES
  ('新規高槻', '新規高槻', 'red', 0),
  ('新規川西', '新規川西', 'purple', 1)
) AS v(name, match_text, color_key, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.calendar_color_master m WHERE m.match_text = v.match_text
);

UPDATE public.calendar_color_master
SET display_order = 5
WHERE match_text = '新規' AND name = '新規';

NOTIFY pgrst, 'reload schema';
