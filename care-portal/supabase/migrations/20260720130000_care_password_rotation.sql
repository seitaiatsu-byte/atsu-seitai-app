-- 入室パス：A〜Eごとの自動更新期間 ＋ パスワード履歴（スタッフが回答できる用）

-- ---------------------------------------------------------------------------
-- プログラムごとのパス更新間隔（月）※0 = 自動更新なし
-- ---------------------------------------------------------------------------
ALTER TABLE care_program_defs
  ADD COLUMN IF NOT EXISTS password_interval_months integer NOT NULL DEFAULT 3;

ALTER TABLE care_program_defs
  DROP CONSTRAINT IF EXISTS care_program_defs_interval_check;

ALTER TABLE care_program_defs
  ADD CONSTRAINT care_program_defs_interval_check
  CHECK (password_interval_months >= 0 AND password_interval_months <= 120);

UPDATE care_program_defs
SET password_interval_months = 3
WHERE password_interval_months IS NULL;

-- ---------------------------------------------------------------------------
-- パスワード履歴（平文・スタッフのみ）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_room_password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES care_member_rooms (id) ON DELETE CASCADE,
  password_plain text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_room_password_history_source_check
    CHECK (source IN ('initial', 'manual', 'auto'))
);

CREATE INDEX IF NOT EXISTS care_room_password_history_room_idx
  ON care_room_password_history (room_id, created_at DESC);

ALTER TABLE care_room_password_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_room_password_history_staff_all ON care_room_password_history;
CREATE POLICY care_room_password_history_staff_all ON care_room_password_history
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

-- ---------------------------------------------------------------------------
-- 次回自動更新日時
-- ---------------------------------------------------------------------------
ALTER TABLE care_member_rooms
  ADD COLUMN IF NOT EXISTS next_password_rotation_at timestamptz;

CREATE INDEX IF NOT EXISTS care_member_rooms_next_rotation_idx
  ON care_member_rooms (next_password_rotation_at)
  WHERE is_active = true AND next_password_rotation_at IS NOT NULL;

CREATE OR REPLACE FUNCTION care_password_interval_months(p_tier text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT password_interval_months
      FROM care_program_defs
      WHERE code = upper(coalesce(nullif(trim(p_tier), ''), 'E'))
    ),
    3
  );
$$;

CREATE OR REPLACE FUNCTION care_compute_next_password_rotation(
  p_from timestamptz,
  p_tier text
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_months integer;
BEGIN
  v_months := care_password_interval_months(p_tier);
  IF v_months IS NULL OR v_months <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN coalesce(p_from, now()) + make_interval(months => v_months);
END;
$$;

CREATE OR REPLACE FUNCTION care_generate_four_digit_password(p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass text;
  v_last text;
  v_try int := 0;
BEGIN
  SELECT password_plain INTO v_last
  FROM care_room_password_history
  WHERE room_id = p_room_id
  ORDER BY created_at DESC
  LIMIT 1;

  LOOP
    v_try := v_try + 1;
    v_pass := lpad((floor(random() * 10000))::int::text, 4, '0');
    EXIT WHEN v_pass IS DISTINCT FROM v_last OR v_try > 20;
  END LOOP;

  RETURN v_pass;
END;
$$;

CREATE OR REPLACE FUNCTION care_apply_room_password(
  p_room_id uuid,
  p_password text,
  p_source text DEFAULT 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_room care_member_rooms%ROWTYPE;
  v_pass text;
  v_source text;
BEGIN
  v_pass := trim(p_password);
  IF v_pass IS NULL OR length(v_pass) < 4 THEN
    RAISE EXCEPTION 'password must be at least 4 characters' USING ERRCODE = '22023';
  END IF;

  v_source := coalesce(nullif(trim(p_source), ''), 'manual');
  IF v_source NOT IN ('initial', 'manual', 'auto') THEN
    v_source := 'manual';
  END IF;

  SELECT * INTO v_room FROM care_member_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE care_member_rooms
  SET
    password_hash = extensions.crypt(v_pass, extensions.gen_salt('bf')),
    password_updated_at = now(),
    next_password_rotation_at = care_compute_next_password_rotation(now(), program_tier),
    updated_at = now()
  WHERE id = p_room_id;

  INSERT INTO care_room_password_history (room_id, password_plain, source)
  VALUES (p_room_id, v_pass, v_source);

  DELETE FROM care_room_sessions WHERE room_id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION care_rotate_room_password_if_due(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room care_member_rooms%ROWTYPE;
  v_pass text;
BEGIN
  SELECT * INTO v_room FROM care_member_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_room.is_active = false THEN
    RETURN false;
  END IF;
  IF v_room.next_password_rotation_at IS NULL OR v_room.next_password_rotation_at > now() THEN
    RETURN false;
  END IF;

  v_pass := care_generate_four_digit_password(p_room_id);
  PERFORM care_apply_room_password(p_room_id, v_pass, 'auto');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION care_rotate_all_due_passwords()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT id
    FROM care_member_rooms
    WHERE is_active = true
      AND next_password_rotation_at IS NOT NULL
      AND next_password_rotation_at <= now()
  LOOP
    IF care_rotate_room_password_if_due(v_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- プログラム変更時に次回更新日を再計算
CREATE OR REPLACE FUNCTION care_member_rooms_tier_rotation_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.program_tier IS DISTINCT FROM OLD.program_tier THEN
    NEW.next_password_rotation_at := care_compute_next_password_rotation(
      NEW.password_updated_at,
      NEW.program_tier
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS care_member_rooms_tier_rotation ON care_member_rooms;
CREATE TRIGGER care_member_rooms_tier_rotation
  BEFORE UPDATE OF program_tier ON care_member_rooms
  FOR EACH ROW
  EXECUTE FUNCTION care_member_rooms_tier_rotation_trg();

-- 既存ルームの次回更新日を埋める（履歴は復元不可）
UPDATE care_member_rooms
SET next_password_rotation_at = care_compute_next_password_rotation(password_updated_at, program_tier)
WHERE next_password_rotation_at IS NULL;

-- ---------------------------------------------------------------------------
-- ルーム作成／パス変更（履歴付き）
-- ---------------------------------------------------------------------------
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
  v_pass text;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;

  v_code := lower(trim(p_room_code));
  IF v_code !~ '^[a-z0-9][a-z0-9-]{2,31}$' THEN
    RAISE EXCEPTION 'invalid room_code format' USING ERRCODE = '22023';
  END IF;
  v_pass := trim(p_password);
  IF v_pass IS NULL OR length(v_pass) < 4 THEN
    RAISE EXCEPTION 'password must be at least 4 characters' USING ERRCODE = '22023';
  END IF;

  v_tier := upper(coalesce(nullif(trim(p_program_tier), ''), 'E'));
  IF v_tier NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    RAISE EXCEPTION 'invalid program_tier' USING ERRCODE = '22023';
  END IF;

  INSERT INTO care_member_rooms (
    member_name, room_code, customer_number, password_hash, program_tier,
    password_updated_at, next_password_rotation_at
  )
  VALUES (
    trim(p_member_name),
    v_code,
    NULLIF(trim(p_customer_number), ''),
    extensions.crypt(v_pass, extensions.gen_salt('bf')),
    v_tier,
    now(),
    care_compute_next_password_rotation(now(), v_tier)
  )
  RETURNING id INTO v_id;

  INSERT INTO care_room_password_history (room_id, password_plain, source)
  VALUES (v_id, v_pass, 'initial');

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_set_room_password(p_room_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  PERFORM care_apply_room_password(p_room_id, p_password, 'manual');
END;
$$;

-- ---------------------------------------------------------------------------
-- ログイン／セッション検証：期限到来なら先に自動更新（旧パスは使えなくなる）
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

  PERFORM care_rotate_room_password_if_due(v_room.id);

  SELECT * INTO v_room
  FROM care_member_rooms
  WHERE id = v_room.id;

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
  v_rotated boolean;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_room FROM care_member_rooms WHERE id = v_sess.room_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  v_rotated := care_rotate_room_password_if_due(v_room.id);
  IF v_rotated THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
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
-- プログラム定義の保存／一覧（間隔つき）
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
      'password_interval_months', password_interval_months,
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
  v_months integer;
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
    v_months := coalesce((v_row->>'password_interval_months')::integer, 3);
    IF v_code NOT IN ('A', 'B', 'C', 'D', 'E') THEN
      CONTINUE;
    END IF;
    IF v_name IS NULL OR v_name = '' THEN
      v_name := v_code;
    END IF;
    IF v_months < 0 THEN v_months := 0; END IF;
    IF v_months > 120 THEN v_months := 120; END IF;

    INSERT INTO care_program_defs (code, display_name, sort_order, password_interval_months, updated_at)
    VALUES (
      v_code,
      v_name,
      CASE v_code WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END,
      v_months,
      now()
    )
    ON CONFLICT (code) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          password_interval_months = EXCLUDED.password_interval_months,
          updated_at = now();
  END LOOP;

  -- 間隔変更を既存ルームの次回更新日に反映
  UPDATE care_member_rooms r
  SET next_password_rotation_at = care_compute_next_password_rotation(r.password_updated_at, r.program_tier);
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_list_room_password_history(p_room_id uuid)
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
      'id', id,
      'password_plain', password_plain,
      'source', source,
      'created_at', created_at
    ) ORDER BY created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM care_room_password_history
  WHERE room_id = p_room_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_rotate_due_passwords()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  RETURN care_rotate_all_due_passwords();
END;
$$;

GRANT EXECUTE ON FUNCTION care_admin_create_room(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_set_room_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_room_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_validate_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_program_defs() TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_save_program_defs(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_list_room_password_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_rotate_due_passwords() TO authenticated;
