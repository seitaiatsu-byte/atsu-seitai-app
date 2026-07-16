-- 小部屋マスター（全ルーム共通の15枠タイトル）と動画の小部屋紐付け

-- ---------------------------------------------------------------------------
-- 小部屋マスター（slot 1〜15）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_sub_room_master (
  slot_number smallint PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_sub_room_master_slot_range CHECK (slot_number >= 1 AND slot_number <= 15)
);

ALTER TABLE care_sub_room_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_sub_room_master_staff_all ON care_sub_room_master
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

-- 会員は RPC 経由でタイトル参照（直接 SELECT は不可）

INSERT INTO care_sub_room_master (slot_number, title) VALUES
  (1, '痛みを遠ざけられて、疲れにくくなる歩き方（カル速歩行/第1段階）'),
  (2, '自分で今の痛みを緩和していくための絶対覚えたいプロ整体の技（基本編）'),
  (3, 'あなたの悪い習慣動作を見つけて変えられる必須アドバイス'),
  (4, '自分で今の痛みを緩和していくための絶対覚えたいプロ整体の技（パート2）'),
  (5, '歩く姿勢が高齢になっても悪くならない方法（カル速歩行/第2段階）'),
  (6, '滑らかにしておかないとあとで後悔するのはどの関節なのか、あなたにだけ全て教えます'),
  (7, 'ここは絶対にやっておかないといけないその部位とストレッチの技を教えます'),
  (8, '10年後も「体幹を安定させていく技！」ふにゃふにゃにならない方法を教えます！'),
  (9, '家族にも教えたくなる、病気にならないための栄養摂取の秘訣を教えます'),
  (10, '命綱は「健康な血管！」あなたの血管に弾力を与える鉄板の方法！'),
  (11, '筋トレの代わりにもなる最強の歩き教えます（カル速歩行/第3段階）'),
  (12, '10年後もバリバリ動けるためのあなたでもできる筋トレ＆体幹トレ教えます'),
  (13, '小部屋13'),
  (14, '小部屋14'),
  (15, '小部屋15')
ON CONFLICT (slot_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 動画に小部屋スロットを追加
-- ---------------------------------------------------------------------------
ALTER TABLE care_room_videos
  ADD COLUMN IF NOT EXISTS sub_room_slot smallint NOT NULL DEFAULT 1;

ALTER TABLE care_room_videos
  DROP CONSTRAINT IF EXISTS care_room_videos_sub_room_slot_range;

ALTER TABLE care_room_videos
  ADD CONSTRAINT care_room_videos_sub_room_slot_range
  CHECK (sub_room_slot >= 1 AND sub_room_slot <= 15);

CREATE INDEX IF NOT EXISTS care_room_videos_sub_room_idx
  ON care_room_videos (room_id, sub_room_slot, is_published);

-- ---------------------------------------------------------------------------
-- 会員：小部屋一覧（タイトル＋本数）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_list_sub_rooms(p_session_token uuid)
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
      'slot_number', m.slot_number,
      'title', m.title,
      'video_count', LEAST(99, coalesce(cnt.c, 0))
    ) ORDER BY m.slot_number
  ), '[]'::jsonb)
  INTO v_result
  FROM care_sub_room_master m
  LEFT JOIN (
    SELECT sub_room_slot, count(*)::int AS c
    FROM care_room_videos
    WHERE room_id = v_sess.room_id AND is_published = true
    GROUP BY sub_room_slot
  ) cnt ON cnt.sub_room_slot = m.slot_number;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 会員：動画一覧（小部屋で絞り込み可）
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS care_room_list_videos(uuid);

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

  IF p_sub_room_slot IS NOT NULL AND (p_sub_room_slot < 1 OR p_sub_room_slot > 15) THEN
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
-- スタッフ：小部屋マスター一覧
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_admin_list_sub_room_master()
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
      'slot_number', slot_number,
      'title', title,
      'updated_at', updated_at
    ) ORDER BY slot_number
  ), '[]'::jsonb)
  INTO v_result
  FROM care_sub_room_master;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- スタッフ：小部屋タイトル更新
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
  IF p_slot_number < 1 OR p_slot_number > 15 THEN
    RAISE EXCEPTION 'slot must be 1-15' USING ERRCODE = '22023';
  END IF;
  IF trim(coalesce(p_title, '')) = '' THEN
    RAISE EXCEPTION 'title is required' USING ERRCODE = '22023';
  END IF;

  UPDATE care_sub_room_master
  SET title = trim(p_title), updated_at = now()
  WHERE slot_number = p_slot_number;
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_list_sub_rooms(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_videos(uuid, smallint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_sub_room_master() TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_update_sub_room_title(smallint, text) TO authenticated;
