-- 勉強部屋②（赤いアイコン）＋ /watch の TOP タイトル

-- ---------------------------------------------------------------------------
-- 勉強部屋を複数部屋対応（study / study2）
-- ---------------------------------------------------------------------------
ALTER TABLE care_study_settings
  DROP CONSTRAINT IF EXISTS care_study_settings_id_check;

ALTER TABLE care_study_settings
  ADD COLUMN IF NOT EXISTS room_key text;

UPDATE care_study_settings
SET room_key = 'study'
WHERE room_key IS NULL;

ALTER TABLE care_study_settings
  ALTER COLUMN room_key SET DEFAULT 'study';

ALTER TABLE care_study_settings
  ALTER COLUMN room_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'care_study_settings_room_key_check'
  ) THEN
    ALTER TABLE care_study_settings
      ADD CONSTRAINT care_study_settings_room_key_check
      CHECK (room_key IN ('study', 'study2'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS care_study_settings_room_key_uidx
  ON care_study_settings (room_key);

INSERT INTO care_study_settings (id, room_key, title)
VALUES (2, 'study2', 'もうひとつの勉強部屋')
ON CONFLICT (id) DO UPDATE
  SET room_key = EXCLUDED.room_key,
      title = COALESCE(NULLIF(care_study_settings.title, ''), EXCLUDED.title);

-- 既存 id=1 を study に固定
UPDATE care_study_settings SET room_key = 'study' WHERE id = 1;

ALTER TABLE care_study_items
  ADD COLUMN IF NOT EXISTS room_key text NOT NULL DEFAULT 'study';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'care_study_items_room_key_check'
  ) THEN
    ALTER TABLE care_study_items
      ADD CONSTRAINT care_study_items_room_key_check
      CHECK (room_key IN ('study', 'study2'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS care_study_items_room_published_idx
  ON care_study_items (room_key, is_published, sort_order DESC, created_at DESC);

-- 旧シグネチャを置き換え
DROP FUNCTION IF EXISTS care_room_get_study_room(uuid);
DROP FUNCTION IF EXISTS care_room_list_study_items(uuid);

CREATE OR REPLACE FUNCTION care_room_get_study_room(
  p_session_token uuid,
  p_room_key text DEFAULT 'study'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_key text;
  v_title text;
  v_count int;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  v_key := coalesce(nullif(trim(p_room_key), ''), 'study');
  IF v_key NOT IN ('study', 'study2') THEN
    v_key := 'study';
  END IF;

  SELECT title INTO v_title FROM care_study_settings WHERE room_key = v_key;
  IF v_title IS NULL OR trim(v_title) = '' THEN
    v_title := CASE WHEN v_key = 'study2' THEN 'もうひとつの勉強部屋' ELSE '健康への勉強部屋' END;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM care_study_items
  WHERE is_published = true AND room_key = v_key;

  RETURN jsonb_build_object(
    'title', v_title,
    'item_count', LEAST(99, coalesce(v_count, 0)),
    'room_key', v_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION care_room_list_study_items(
  p_session_token uuid,
  p_room_key text DEFAULT 'study'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_key text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  v_key := coalesce(nullif(trim(p_room_key), ''), 'study');
  IF v_key NOT IN ('study', 'study2') THEN
    v_key := 'study';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'item_type', i.item_type,
      'title', i.title,
      'external_url', i.external_url,
      'has_file', (i.storage_path IS NOT NULL),
      'created_at', i.created_at,
      'sort_order', i.sort_order
    ) ORDER BY i.sort_order DESC, i.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM care_study_items i
  WHERE i.is_published = true AND i.room_key = v_key;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- /watch の TOP タイトル（勉強部屋の下・動画の上）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_watch_ui_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  top_title text NOT NULL DEFAULT 'セルフケア動画',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE care_watch_ui_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_watch_ui_settings_staff_all ON care_watch_ui_settings;
CREATE POLICY care_watch_ui_settings_staff_all ON care_watch_ui_settings
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

INSERT INTO care_watch_ui_settings (id, top_title)
VALUES (1, 'セルフケア動画')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION care_room_get_watch_top_title(p_session_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_title text;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT top_title INTO v_title FROM care_watch_ui_settings WHERE id = 1;
  RETURN coalesce(nullif(trim(v_title), ''), 'セルフケア動画');
END;
$$;

-- ---------------------------------------------------------------------------
-- 表示順・鍵ルールに study2 を追加
-- ---------------------------------------------------------------------------
ALTER TABLE care_watch_layout DROP CONSTRAINT IF EXISTS care_watch_layout_key_check;
ALTER TABLE care_watch_layout
  ADD CONSTRAINT care_watch_layout_key_check CHECK (
    item_key IN ('study', 'study2')
    OR item_key IN ('greeting_A', 'greeting_B', 'greeting_C')
    OR item_key ~ '^sub_([1-9]|1[0-9]|20)$'
  );

INSERT INTO care_watch_layout (item_key, sort_order)
VALUES ('study2', 15)
ON CONFLICT (item_key) DO NOTHING;

ALTER TABLE care_program_item_rules DROP CONSTRAINT IF EXISTS care_program_item_rules_key_check;
ALTER TABLE care_program_item_rules
  ADD CONSTRAINT care_program_item_rules_key_check CHECK (
    item_key IN ('study', 'study2')
    OR item_key IN ('greeting_A', 'greeting_B', 'greeting_C')
    OR item_key ~ '^sub_([1-9]|1[0-9]|20)$'
  );

INSERT INTO care_program_item_rules (item_key, allowed_tiers)
VALUES ('study2', ARRAY['A','B','C','D','E']::text[])
ON CONFLICT (item_key) DO NOTHING;

-- save_watch_layout のキー検証を更新
CREATE OR REPLACE FUNCTION care_admin_save_watch_layout(p_item_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_order integer := 0;
  v_seen text[] := ARRAY[]::text[];
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF p_item_keys IS NULL OR array_length(p_item_keys, 1) IS NULL THEN
    RAISE EXCEPTION 'item_keys required' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY p_item_keys
  LOOP
    IF v_key IS NULL OR v_key = '' THEN
      CONTINUE;
    END IF;
    IF NOT (
      v_key IN ('study', 'study2')
      OR v_key IN ('greeting_A', 'greeting_B', 'greeting_C')
      OR v_key ~ '^sub_([1-9]|1[0-9]|20)$'
    ) THEN
      CONTINUE;
    END IF;
    IF v_key = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_key);
    v_order := v_order + 10;
    INSERT INTO care_watch_layout (item_key, sort_order, updated_at)
    VALUES (v_key, v_order, now())
    ON CONFLICT (item_key) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, updated_at = now();
  END LOOP;
END;
$$;

-- save_watch_layout のキー検証を更新後、study2 の並び位置を勉強部屋の直後へ寄せる
UPDATE care_watch_layout AS w
SET sort_order = s.sort_order + 5,
    updated_at = now()
FROM care_watch_layout s
WHERE w.item_key = 'study2'
  AND s.item_key = 'study';

GRANT EXECUTE ON FUNCTION care_admin_save_watch_layout(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION care_room_get_study_room(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_study_items(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_get_watch_top_title(uuid) TO anon, authenticated;
