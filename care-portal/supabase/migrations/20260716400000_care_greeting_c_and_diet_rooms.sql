-- 挨拶動画Cの追加 ＋ ダイエット用小部屋5枠（16〜20）

-- ---------------------------------------------------------------------------
-- 挨拶動画：C を追加
-- ---------------------------------------------------------------------------
ALTER TABLE care_greeting_videos
  DROP CONSTRAINT IF EXISTS care_greeting_slot_code;

ALTER TABLE care_greeting_videos
  ADD CONSTRAINT care_greeting_slot_code CHECK (slot_code IN ('A', 'B', 'C'));

INSERT INTO care_greeting_videos (slot_code, title) VALUES
  ('C', '挨拶動画C')
ON CONFLICT (slot_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 小部屋マスター：16〜20 を追加（ダイエット枠）
-- ---------------------------------------------------------------------------
ALTER TABLE care_sub_room_master
  DROP CONSTRAINT IF EXISTS care_sub_room_master_slot_range;

ALTER TABLE care_sub_room_master
  ADD CONSTRAINT care_sub_room_master_slot_range
  CHECK (slot_number >= 1 AND slot_number <= 20);

INSERT INTO care_sub_room_master (slot_number, title) VALUES
  (16, 'ダイエットの基本'),
  (17, '食事のポイント'),
  (18, '運動とダイエット'),
  (19, '習慣づくり'),
  (20, '体組成の見直し')
ON CONFLICT (slot_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 動画の小部屋スロット：1〜20
-- ---------------------------------------------------------------------------
ALTER TABLE care_room_videos
  DROP CONSTRAINT IF EXISTS care_room_videos_sub_room_slot_range;

ALTER TABLE care_room_videos
  ADD CONSTRAINT care_room_videos_sub_room_slot_range
  CHECK (sub_room_slot >= 1 AND sub_room_slot <= 20);

-- ---------------------------------------------------------------------------
-- 会員：動画一覧（スロット上限を20に）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_list_videos(
  p_session_token uuid,
  p_sub_room_slot smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_videos jsonb;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  IF p_sub_room_slot IS NOT NULL AND (p_sub_room_slot < 1 OR p_sub_room_slot > 20) THEN
    RAISE EXCEPTION 'invalid sub_room_slot' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'description', v.description,
      'duration_seconds', v.duration_seconds,
      'uploaded_at', v.uploaded_at,
      'sort_order', v.sort_order,
      'sub_room_slot', v.sub_room_slot
    ) ORDER BY v.sort_order DESC, v.uploaded_at DESC
  ), '[]'::jsonb)
  INTO v_videos
  FROM care_room_videos v
  WHERE v.room_id = v_sess.room_id
    AND v.is_published = true
    AND (p_sub_room_slot IS NULL OR v.sub_room_slot = p_sub_room_slot);

  RETURN v_videos;
END;
$$;

-- ---------------------------------------------------------------------------
-- スタッフ：小部屋タイトル更新（1〜20）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_admin_update_sub_room_title(
  p_slot_number smallint,
  p_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF p_slot_number < 1 OR p_slot_number > 20 THEN
    RAISE EXCEPTION 'slot must be 1-20' USING ERRCODE = '22023';
  END IF;
  IF trim(coalesce(p_title, '')) = '' THEN
    RAISE EXCEPTION 'title is required' USING ERRCODE = '22023';
  END IF;

  UPDATE care_sub_room_master
  SET title = trim(p_title), updated_at = now()
  WHERE slot_number = p_slot_number;
END;
$$;
