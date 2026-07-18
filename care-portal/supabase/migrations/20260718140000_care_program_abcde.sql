-- プログラム区分を A〜E（名称変更可）へ。鍵は枠ごとに開ける区分を自由指定。
-- 併せてログイン／検証の GRANT を再付与（入れない不具合対策）

-- ---------------------------------------------------------------------------
-- プログラム定義（A〜E・表示名はスタッフが変更可）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_program_defs (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_program_defs_code_check CHECK (code IN ('A', 'B', 'C', 'D', 'E'))
);

ALTER TABLE care_program_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_program_defs_staff_all ON care_program_defs;
CREATE POLICY care_program_defs_staff_all ON care_program_defs
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

INSERT INTO care_program_defs (code, display_name, sort_order) VALUES
  ('A', 'A', 1),
  ('B', 'B', 2),
  ('C', 'C', 3),
  ('D', 'D', 4),
  ('E', 'E', 5)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 会員ルームの program_tier を A〜E に移行
-- ---------------------------------------------------------------------------
ALTER TABLE care_member_rooms
  DROP CONSTRAINT IF EXISTS care_member_rooms_program_tier_check;

UPDATE care_member_rooms
SET program_tier = CASE program_tier
  WHEN 'p10' THEN 'A'
  WHEN 'p20' THEN 'B'
  WHEN 'p30' THEN 'E'
  WHEN 'A' THEN 'A'
  WHEN 'B' THEN 'B'
  WHEN 'C' THEN 'C'
  WHEN 'D' THEN 'D'
  WHEN 'E' THEN 'E'
  ELSE 'E'
END
WHERE program_tier IS DISTINCT FROM CASE program_tier
  WHEN 'p10' THEN 'A'
  WHEN 'p20' THEN 'B'
  WHEN 'p30' THEN 'E'
  WHEN 'A' THEN 'A'
  WHEN 'B' THEN 'B'
  WHEN 'C' THEN 'C'
  WHEN 'D' THEN 'D'
  WHEN 'E' THEN 'E'
  ELSE 'E'
END;

ALTER TABLE care_member_rooms
  ALTER COLUMN program_tier SET DEFAULT 'E';

ALTER TABLE care_member_rooms
  ADD CONSTRAINT care_member_rooms_program_tier_check
  CHECK (program_tier IN ('A', 'B', 'C', 'D', 'E'));

-- ---------------------------------------------------------------------------
-- 鍵ルール：開けるプログラムコードの配列（自由設定）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_program_item_rules (
  item_key text PRIMARY KEY,
  min_tier smallint DEFAULT 10,
  allowed_tiers text[] NOT NULL DEFAULT ARRAY['A','B','C','D','E']::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
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

ALTER TABLE care_program_item_rules
  ADD COLUMN IF NOT EXISTS allowed_tiers text[] NOT NULL DEFAULT ARRAY['A','B','C','D','E']::text[];

-- program_tier 列が無い環境向け
ALTER TABLE care_member_rooms
  ADD COLUMN IF NOT EXISTS program_tier text NOT NULL DEFAULT 'E';

-- 旧 min_tier から初期 allowed_tiers を埋める（列がある場合）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'care_program_item_rules'
      AND column_name = 'min_tier'
  ) THEN
    UPDATE care_program_item_rules
    SET allowed_tiers = CASE min_tier
      WHEN 10 THEN ARRAY['A','B','C','D','E']::text[]
      WHEN 20 THEN ARRAY['B','C','D','E']::text[]
      WHEN 30 THEN ARRAY['E']::text[]
      ELSE ARRAY['A','B','C','D','E']::text[]
    END
    WHERE allowed_tiers IS NULL
       OR allowed_tiers = ARRAY['A','B','C','D','E']::text[];
  END IF;
END $$;

-- 欠けている枠を全開放で補完
INSERT INTO care_program_item_rules (item_key, allowed_tiers) VALUES
  ('study', ARRAY['A','B','C','D','E']),
  ('greeting_A', ARRAY['A','B','C','D','E']),
  ('greeting_B', ARRAY['A','B','C','D','E']),
  ('greeting_C', ARRAY['A','B','C','D','E']),
  ('sub_1', ARRAY['A','B','C','D','E']), ('sub_2', ARRAY['A','B','C','D','E']),
  ('sub_3', ARRAY['A','B','C','D','E']), ('sub_4', ARRAY['A','B','C','D','E']),
  ('sub_5', ARRAY['A','B','C','D','E']), ('sub_6', ARRAY['A','B','C','D','E']),
  ('sub_7', ARRAY['A','B','C','D','E']), ('sub_8', ARRAY['A','B','C','D','E']),
  ('sub_9', ARRAY['A','B','C','D','E']), ('sub_10', ARRAY['A','B','C','D','E']),
  ('sub_11', ARRAY['A','B','C','D','E']), ('sub_12', ARRAY['A','B','C','D','E']),
  ('sub_16', ARRAY['B','C','D','E']), ('sub_17', ARRAY['B','C','D','E']),
  ('sub_18', ARRAY['B','C','D','E']), ('sub_19', ARRAY['B','C','D','E']),
  ('sub_20', ARRAY['B','C','D','E']),
  ('sub_13', ARRAY['E']), ('sub_14', ARRAY['E']), ('sub_15', ARRAY['E'])
ON CONFLICT (item_key) DO NOTHING;

ALTER TABLE care_program_item_rules
  DROP CONSTRAINT IF EXISTS care_program_item_rules_tier_check;

-- min_tier は互換のため残すが、判定は allowed_tiers を使う

-- ---------------------------------------------------------------------------
-- ルーム作成（A〜E）
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS care_admin_create_room(text, text, text, text);
DROP FUNCTION IF EXISTS care_admin_create_room(text, text, text, text, text);

CREATE OR REPLACE FUNCTION care_admin_create_room(
  p_member_name text,
  p_room_code text,
  p_password text,
  p_customer_number text DEFAULT NULL,
  p_program_tier text DEFAULT 'E'
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

  v_tier := upper(coalesce(nullif(trim(p_program_tier), ''), 'E'));
  IF v_tier NOT IN ('A', 'B', 'C', 'D', 'E') THEN
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
-- ログイン／検証（再定義＋GRANT）
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
  v_tier text;
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

  IF v_room.password_hash IS DISTINCT FROM extensions.crypt(trim(p_password), v_room.password_hash) THEN
    RAISE EXCEPTION 'invalid credentials' USING ERRCODE = '28000';
  END IF;

  v_tier := upper(coalesce(nullif(trim(v_room.program_tier), ''), 'E'));
  IF v_tier NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    v_tier := 'E';
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
    'program_tier', v_tier
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
  v_tier text;
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

  v_tier := upper(coalesce(nullif(trim(v_room.program_tier), ''), 'E'));
  IF v_tier NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    v_tier := 'E';
  END IF;

  RETURN jsonb_build_object(
    'session_token', v_sess.id,
    'member_name', v_room.member_name,
    'room_code', v_room.room_code,
    'expires_at', v_sess.expires_at,
    'program_tier', v_tier
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 解錠判定：allowed_tiers に含まれるか
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_program_item_unlocked(p_tier text, p_item_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tiers text[];
  v_tier text;
BEGIN
  v_tier := upper(coalesce(nullif(trim(p_tier), ''), 'E'));
  SELECT allowed_tiers INTO v_tiers
  FROM care_program_item_rules
  WHERE item_key = p_item_key;

  IF NOT FOUND OR v_tiers IS NULL THEN
    RETURN true;
  END IF;
  RETURN v_tier = ANY (v_tiers);
END;
$$;

CREATE OR REPLACE FUNCTION care_room_list_item_access(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_room care_member_rooms%ROWTYPE;
  v_tier text;
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

  v_tier := upper(coalesce(nullif(trim(v_room.program_tier), ''), 'E'));
  IF v_tier NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    v_tier := 'E';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'item_key', r.item_key,
      'allowed_tiers', to_jsonb(r.allowed_tiers),
      'unlocked', (v_tier = ANY (r.allowed_tiers))
    ) ORDER BY r.item_key
  ), '[]'::jsonb)
  INTO v_result
  FROM care_program_item_rules r;

  RETURN jsonb_build_object(
    'program_tier', v_tier,
    'items', v_result
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- スタッフ：プログラム名一覧／保存
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_admin_list_program_defs()
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
      'code', code,
      'display_name', display_name,
      'sort_order', sort_order,
      'updated_at', updated_at
    ) ORDER BY sort_order, code
  ), '[]'::jsonb)
  INTO v_result
  FROM care_program_defs;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_save_program_defs(p_defs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_code text;
  v_name text;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF p_defs IS NULL OR jsonb_typeof(p_defs) <> 'array' THEN
    RAISE EXCEPTION 'defs array required' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_defs)
  LOOP
    v_code := upper(trim(v_row->>'code'));
    v_name := trim(v_row->>'display_name');
    IF v_code NOT IN ('A', 'B', 'C', 'D', 'E') THEN
      CONTINUE;
    END IF;
    IF v_name IS NULL OR v_name = '' THEN
      v_name := v_code;
    END IF;
    INSERT INTO care_program_defs (code, display_name, sort_order, updated_at)
    VALUES (v_code, v_name, CASE v_code WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END, now())
    ON CONFLICT (code) DO UPDATE
      SET display_name = EXCLUDED.display_name, updated_at = now();
  END LOOP;
END;
$$;

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
      'allowed_tiers', to_jsonb(allowed_tiers),
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
  v_tiers text[];
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
    IF v_key IS NULL OR v_key = '' THEN
      CONTINUE;
    END IF;
    SELECT coalesce(array_agg(upper(t)), ARRAY[]::text[])
    INTO v_tiers
    FROM jsonb_array_elements_text(coalesce(v_row->'allowed_tiers', '[]'::jsonb)) AS t
    WHERE upper(t) IN ('A', 'B', 'C', 'D', 'E');

    INSERT INTO care_program_item_rules (item_key, allowed_tiers, updated_at)
    VALUES (v_key, v_tiers, now())
    ON CONFLICT (item_key) DO UPDATE
      SET allowed_tiers = EXCLUDED.allowed_tiers, updated_at = now();
  END LOOP;
END;
$$;

-- 動画一覧：範囲外は空
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

  IF p_sub_room_slot IS NOT NULL
     AND NOT care_program_item_unlocked(v_room.program_tier, 'sub_' || p_sub_room_slot::text) THEN
    RETURN '[]'::jsonb;
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
-- スタッフ：会員部屋を確認（プレビューセッション発行）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_admin_start_room_preview(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room care_member_rooms%ROWTYPE;
  v_session_id uuid;
  v_expires timestamptz;
  v_tier text;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_room FROM care_member_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found' USING ERRCODE = 'P0002';
  END IF;

  v_tier := upper(coalesce(nullif(trim(v_room.program_tier), ''), 'E'));
  IF v_tier NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    v_tier := 'E';
  END IF;

  v_expires := now() + interval '2 hours';
  INSERT INTO care_room_sessions (room_id, expires_at)
  VALUES (v_room.id, v_expires)
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_token', v_session_id,
    'member_name', v_room.member_name,
    'room_code', v_room.room_code,
    'expires_at', v_expires,
    'program_tier', v_tier,
    'staff_preview', true,
    'admin_room_id', v_room.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_validate_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_item_access(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_videos(uuid, smallint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_admin_create_room(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_program_defs() TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_save_program_defs(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_program_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_save_program_rules(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_start_room_preview(uuid) TO authenticated;
