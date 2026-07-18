-- 購入プログラム（10万/20万/30万）と鍵ルール

-- ---------------------------------------------------------------------------
-- 会員ルームにプログラム段階を追加
-- ---------------------------------------------------------------------------
ALTER TABLE care_member_rooms
  ADD COLUMN IF NOT EXISTS program_tier text NOT NULL DEFAULT 'p30';

ALTER TABLE care_member_rooms
  DROP CONSTRAINT IF EXISTS care_member_rooms_program_tier_check;

ALTER TABLE care_member_rooms
  ADD CONSTRAINT care_member_rooms_program_tier_check
  CHECK (program_tier IN ('p10', 'p20', 'p30'));

-- ---------------------------------------------------------------------------
-- 各枠の必要プログラム（min_tier: 10/20/30）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_program_item_rules (
  item_key text PRIMARY KEY,
  min_tier smallint NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_program_item_rules_tier_check CHECK (min_tier IN (10, 20, 30)),
  CONSTRAINT care_program_item_rules_key_check CHECK (
    item_key = 'study'
    OR item_key IN ('greeting_A', 'greeting_B', 'greeting_C')
    OR item_key ~ '^sub_([1-9]|1[0-9]|20)$'
  )
);

ALTER TABLE care_program_item_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_program_item_rules_staff_all ON care_program_item_rules;
CREATE POLICY care_program_item_rules_staff_all ON care_program_item_rules
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

-- 初期値：勉強・挨拶・①〜⑫は10万〜、ダイエットは20万〜、下部枠は30万
INSERT INTO care_program_item_rules (item_key, min_tier) VALUES
  ('study', 10),
  ('greeting_A', 10),
  ('greeting_B', 10),
  ('greeting_C', 10),
  ('sub_1', 10), ('sub_2', 10), ('sub_3', 10), ('sub_4', 10),
  ('sub_5', 10), ('sub_6', 10), ('sub_7', 10), ('sub_8', 10),
  ('sub_9', 10), ('sub_10', 10), ('sub_11', 10), ('sub_12', 10),
  ('sub_16', 20), ('sub_17', 20), ('sub_18', 20), ('sub_19', 20), ('sub_20', 20),
  ('sub_13', 30), ('sub_14', 30), ('sub_15', 30)
ON CONFLICT (item_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ヘルパ：tier コード → 数値
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_program_tier_rank(p_tier text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
    WHEN 'p10' THEN 10::smallint
    WHEN 'p20' THEN 20::smallint
    WHEN 'p30' THEN 30::smallint
    ELSE 10::smallint
  END;
$$;

-- ---------------------------------------------------------------------------
-- ルーム作成：プログラム指定対応
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS care_admin_create_room(text, text, text, text);

CREATE OR REPLACE FUNCTION care_admin_create_room(
  p_member_name text,
  p_room_code text,
  p_password text,
  p_customer_number text DEFAULT NULL,
  p_program_tier text DEFAULT 'p30'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_code text;
  v_tier text;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;

  v_code := lower(trim(p_room_code));
  IF v_code !~ '^[a-z0-9][a-z0-9-]{2,31}$' THEN
    RAISE EXCEPTION 'invalid room_code format' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NULL OR length(trim(p_password)) < 4 THEN
    RAISE EXCEPTION 'password must be at least 4 characters' USING ERRCODE = '22023';
  END IF;

  v_tier := coalesce(nullif(trim(p_program_tier), ''), 'p30');
  IF v_tier NOT IN ('p10', 'p20', 'p30') THEN
    RAISE EXCEPTION 'invalid program_tier' USING ERRCODE = '22023';
  END IF;

  INSERT INTO care_member_rooms (member_name, room_code, customer_number, password_hash, program_tier)
  VALUES (
    trim(p_member_name),
    v_code,
    NULLIF(trim(p_customer_number), ''),
    extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
    v_tier
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- ログイン／セッション検証に program_tier を含める
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_login(p_room_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_room care_member_rooms%ROWTYPE;
  v_session_id uuid;
  v_expires timestamptz;
BEGIN
  IF p_room_code IS NULL OR trim(p_room_code) = '' OR p_password IS NULL OR p_password = '' THEN
    RAISE EXCEPTION 'room_code and password are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_room
  FROM care_member_rooms
  WHERE lower(room_code) = lower(trim(p_room_code))
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid credentials' USING ERRCODE = '28000';
  END IF;

  IF v_room.password_hash IS DISTINCT FROM extensions.crypt(p_password, v_room.password_hash) THEN
    RAISE EXCEPTION 'invalid credentials' USING ERRCODE = '28000';
  END IF;

  v_expires := now() + interval '30 days';
  INSERT INTO care_room_sessions (room_id, expires_at)
  VALUES (v_room.id, v_expires)
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_token', v_session_id,
    'member_name', v_room.member_name,
    'room_code', v_room.room_code,
    'expires_at', v_expires,
    'program_tier', coalesce(v_room.program_tier, 'p30')
  );
END;
$$;

CREATE OR REPLACE FUNCTION care_room_validate_session(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_room care_member_rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_room FROM care_member_rooms WHERE id = v_sess.room_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room inactive' USING ERRCODE = '28000';
  END IF;

  RETURN jsonb_build_object(
    'session_token', v_sess.id,
    'member_name', v_room.member_name,
    'room_code', v_room.room_code,
    'expires_at', v_sess.expires_at,
    'program_tier', coalesce(v_room.program_tier, 'p30')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 会員：各枠の解錠状態
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_list_item_access(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_room care_member_rooms%ROWTYPE;
  v_rank smallint;
  v_result jsonb;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_room FROM care_member_rooms WHERE id = v_sess.room_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room inactive' USING ERRCODE = '28000';
  END IF;

  v_rank := care_program_tier_rank(coalesce(v_room.program_tier, 'p30'));

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'item_key', r.item_key,
      'min_tier', r.min_tier,
      'unlocked', (v_rank >= r.min_tier)
    ) ORDER BY r.item_key
  ), '[]'::jsonb)
  INTO v_result
  FROM care_program_item_rules r;

  RETURN jsonb_build_object(
    'program_tier', coalesce(v_room.program_tier, 'p30'),
    'items', v_result
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- スタッフ：鍵ルール一覧／保存
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_admin_list_program_rules()
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
      'min_tier', min_tier,
      'updated_at', updated_at
    ) ORDER BY item_key
  ), '[]'::jsonb)
  INTO v_result
  FROM care_program_item_rules;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_save_program_rules(p_rules jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_key text;
  v_tier smallint;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' THEN
    RAISE EXCEPTION 'rules array required' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rules)
  LOOP
    v_key := v_row->>'item_key';
    v_tier := (v_row->>'min_tier')::smallint;
    IF v_key IS NULL OR v_tier IS NULL OR v_tier NOT IN (10, 20, 30) THEN
      CONTINUE;
    END IF;
    INSERT INTO care_program_item_rules (item_key, min_tier, updated_at)
    VALUES (v_key, v_tier, now())
    ON CONFLICT (item_key) DO UPDATE
      SET min_tier = EXCLUDED.min_tier, updated_at = now();
  END LOOP;
END;
$$;

-- 動画一覧：範囲外スロットは空を返す（直接URL対策）
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
  v_room care_member_rooms%ROWTYPE;
  v_rank smallint;
  v_min smallint;
  v_videos jsonb;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_room FROM care_member_rooms WHERE id = v_sess.room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  IF p_sub_room_slot IS NOT NULL AND (p_sub_room_slot < 1 OR p_sub_room_slot > 20) THEN
    RAISE EXCEPTION 'invalid sub_room_slot' USING ERRCODE = '22023';
  END IF;

  IF p_sub_room_slot IS NOT NULL THEN
    v_rank := care_program_tier_rank(coalesce(v_room.program_tier, 'p30'));
    SELECT min_tier INTO v_min
    FROM care_program_item_rules
    WHERE item_key = 'sub_' || p_sub_room_slot::text;
    IF v_min IS NOT NULL AND v_rank < v_min THEN
      RETURN '[]'::jsonb;
    END IF;
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

GRANT EXECUTE ON FUNCTION care_room_list_item_access(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_program_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_save_program_rules(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_create_room(text, text, text, text, text) TO authenticated;
