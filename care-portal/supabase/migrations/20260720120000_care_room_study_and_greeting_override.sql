-- 個人部屋：勉強部屋資料の追加 ＋ 挨拶動画②（個人上書き）

-- ---------------------------------------------------------------------------
-- 勉強部屋：マスター共通（member_room_id NULL）＋ 個人部屋専用
-- ---------------------------------------------------------------------------
ALTER TABLE care_study_items
  ADD COLUMN IF NOT EXISTS member_room_id uuid REFERENCES care_member_rooms (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS care_study_items_member_room_idx
  ON care_study_items (member_room_id, room_key, is_published, sort_order DESC, created_at DESC);

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
  WHERE is_published = true
    AND room_key = v_key
    AND (member_room_id IS NULL OR member_room_id = v_sess.room_id);

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
      'sort_order', i.sort_order,
      'is_room_only', (i.member_room_id IS NOT NULL)
    ) ORDER BY i.sort_order DESC, i.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM care_study_items i
  WHERE i.is_published = true
    AND i.room_key = v_key
    AND (i.member_room_id IS NULL OR i.member_room_id = v_sess.room_id);

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 挨拶動画②：個人部屋の上書き（削除するとマスター①に戻る）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_room_greeting_overrides (
  room_id uuid NOT NULL REFERENCES care_member_rooms (id) ON DELETE CASCADE,
  slot_code text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  storage_path text,
  file_size bigint,
  is_published boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, slot_code),
  CONSTRAINT care_room_greeting_overrides_slot_check CHECK (slot_code IN ('A', 'B', 'C'))
);

CREATE UNIQUE INDEX IF NOT EXISTS care_room_greeting_overrides_id_uidx
  ON care_room_greeting_overrides (id);

ALTER TABLE care_room_greeting_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_room_greeting_overrides_staff_all ON care_room_greeting_overrides;
CREATE POLICY care_room_greeting_overrides_staff_all ON care_room_greeting_overrides
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

CREATE OR REPLACE FUNCTION care_room_list_greeting_videos(p_session_token uuid)
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
      'slot_code', g.slot_code,
      'id', CASE
        WHEN o.storage_path IS NOT NULL AND o.is_published = true THEN o.id
        ELSE g.id
      END,
      'title', CASE
        WHEN o.storage_path IS NOT NULL AND o.is_published = true
          THEN coalesce(nullif(trim(o.title), ''), g.title)
        ELSE g.title
      END,
      'has_video', CASE
        WHEN o.storage_path IS NOT NULL AND o.is_published = true THEN true
        ELSE (g.storage_path IS NOT NULL AND g.is_published = true)
      END,
      'uploaded_at', CASE
        WHEN o.storage_path IS NOT NULL AND o.is_published = true THEN o.uploaded_at
        ELSE g.uploaded_at
      END,
      'is_room_override', (o.storage_path IS NOT NULL AND o.is_published = true)
    ) ORDER BY
      CASE g.slot_code WHEN 'A' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3 ELSE 9 END
  ), '[]'::jsonb)
  INTO v_result
  FROM care_greeting_videos g
  LEFT JOIN care_room_greeting_overrides o
    ON o.slot_code = g.slot_code
   AND o.room_id = v_sess.room_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_get_study_room(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_study_items(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_greeting_videos(uuid) TO anon, authenticated;
