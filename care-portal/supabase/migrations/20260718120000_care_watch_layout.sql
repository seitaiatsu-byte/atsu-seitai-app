-- 会員 /watch の表示順マスター（全院共通）

CREATE TABLE IF NOT EXISTS care_watch_layout (
  item_key text PRIMARY KEY,
  sort_order integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_watch_layout_key_check CHECK (
    item_key = 'study'
    OR item_key IN ('greeting_A', 'greeting_B', 'greeting_C')
    OR item_key ~ '^sub_([1-9]|1[0-9]|20)$'
  )
);

CREATE INDEX IF NOT EXISTS care_watch_layout_sort_idx ON care_watch_layout (sort_order);

ALTER TABLE care_watch_layout ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_watch_layout_staff_all ON care_watch_layout;
CREATE POLICY care_watch_layout_staff_all ON care_watch_layout
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

-- 現行の固定並びを初期値として投入
INSERT INTO care_watch_layout (item_key, sort_order) VALUES
  ('study', 10),
  ('greeting_A', 20),
  ('sub_1', 30),
  ('sub_2', 40),
  ('sub_3', 50),
  ('sub_4', 60),
  ('sub_5', 70),
  ('sub_6', 80),
  ('sub_7', 90),
  ('sub_8', 100),
  ('sub_9', 110),
  ('sub_10', 120),
  ('sub_11', 130),
  ('sub_12', 140),
  ('greeting_C', 150),
  ('sub_16', 160),
  ('sub_17', 170),
  ('sub_18', 180),
  ('sub_19', 190),
  ('sub_20', 200),
  ('greeting_B', 210),
  ('sub_13', 220),
  ('sub_14', 230),
  ('sub_15', 240)
ON CONFLICT (item_key) DO NOTHING;

-- 会員：表示順一覧
CREATE OR REPLACE FUNCTION care_room_list_watch_layout(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'item_key', item_key,
      'sort_order', sort_order
    ) ORDER BY sort_order ASC, item_key ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM care_watch_layout;

  RETURN v_result;
END;
$$;

-- スタッフ：表示順一覧
CREATE OR REPLACE FUNCTION care_admin_list_watch_layout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'item_key', item_key,
      'sort_order', sort_order,
      'updated_at', updated_at
    ) ORDER BY sort_order ASC, item_key ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM care_watch_layout;

  RETURN v_result;
END;
$$;

-- スタッフ：表示順を一括保存（item_key の配列順＝表示順）
CREATE OR REPLACE FUNCTION care_admin_save_watch_layout(p_item_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i integer;
  v_key text;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF p_item_keys IS NULL OR array_length(p_item_keys, 1) IS NULL THEN
    RAISE EXCEPTION 'item_keys required' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1 .. array_length(p_item_keys, 1) LOOP
    v_key := p_item_keys[i];
    UPDATE care_watch_layout
    SET sort_order = i * 10, updated_at = now()
    WHERE item_key = v_key;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_list_watch_layout(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_watch_layout() TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_save_watch_layout(text[]) TO authenticated;
