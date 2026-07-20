-- 挨拶の表示順を A → B → C に揃える（従来は A → C → B）
-- 会員画面・鍵ルール・表示順リストに反映

DO $$
DECLARE
  b_ord integer;
  c_ord integer;
BEGIN
  SELECT sort_order INTO b_ord FROM care_watch_layout WHERE item_key = 'greeting_B';
  SELECT sort_order INTO c_ord FROM care_watch_layout WHERE item_key = 'greeting_C';

  IF b_ord IS NULL OR c_ord IS NULL THEN
    RETURN;
  END IF;

  -- すでに B が C より前なら何もしない
  IF b_ord < c_ord THEN
    RETURN;
  END IF;

  UPDATE care_watch_layout SET sort_order = -900001, updated_at = now() WHERE item_key = 'greeting_B';
  UPDATE care_watch_layout SET sort_order = b_ord, updated_at = now() WHERE item_key = 'greeting_C';
  UPDATE care_watch_layout SET sort_order = c_ord, updated_at = now() WHERE item_key = 'greeting_B';
END $$;
