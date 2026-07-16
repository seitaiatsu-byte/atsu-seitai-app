-- あつ整体院 セルフケア動画ポータル（会員ごとの鍵付き部屋）
-- 既存整体院アプリとは別テーブル群（care_*）

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- スタッフ（Supabase Auth ユーザーと紐付け）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE care_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_staff_select_self ON care_staff
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 会員の部屋
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_member_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL UNIQUE,
  member_name text NOT NULL,
  customer_number text,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_member_rooms_room_code_format CHECK (room_code ~ '^[a-z0-9][a-z0-9-]{2,31}$')
);

CREATE INDEX IF NOT EXISTS care_member_rooms_active_idx ON care_member_rooms (is_active);
CREATE INDEX IF NOT EXISTS care_member_rooms_customer_number_idx ON care_member_rooms (customer_number);

-- ---------------------------------------------------------------------------
-- 部屋の動画
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_room_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES care_member_rooms (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  file_size bigint,
  duration_seconds integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS care_room_videos_room_idx ON care_room_videos (room_id, is_published, sort_order DESC, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- 会員セッション（入室パス認証後）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_room_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES care_member_rooms (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS care_room_sessions_expires_idx ON care_room_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- updated_at トリガー
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS care_member_rooms_updated_at ON care_member_rooms;
CREATE TRIGGER care_member_rooms_updated_at
  BEFORE UPDATE ON care_member_rooms
  FOR EACH ROW EXECUTE FUNCTION care_touch_updated_at();

-- ---------------------------------------------------------------------------
-- スタッフ判定
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM care_staff WHERE user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE care_member_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_room_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_room_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_rooms_staff_all ON care_member_rooms
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

CREATE POLICY care_videos_staff_all ON care_room_videos
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

-- セッションは RPC 経由のみ（直接テーブル操作はスタッフのみ）
CREATE POLICY care_sessions_staff_select ON care_room_sessions
  FOR SELECT TO authenticated
  USING (care_is_staff());

CREATE POLICY care_sessions_staff_delete ON care_room_sessions
  FOR DELETE TO authenticated
  USING (care_is_staff());

-- ---------------------------------------------------------------------------
-- ストレージバケット（非公開）
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'care-videos',
  'care-videos',
  false,
  524288000,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY care_videos_storage_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'care-videos' AND care_is_staff());

CREATE POLICY care_videos_storage_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'care-videos' AND care_is_staff())
  WITH CHECK (bucket_id = 'care-videos' AND care_is_staff());

CREATE POLICY care_videos_storage_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'care-videos' AND care_is_staff());

CREATE POLICY care_videos_storage_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'care-videos' AND care_is_staff());

-- ---------------------------------------------------------------------------
-- 会員向け RPC（anon から呼び出し可）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION care_room_login(p_room_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF v_room.password_hash IS DISTINCT FROM crypt(p_password, v_room.password_hash) THEN
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
    'expires_at', v_expires
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
    'expires_at', v_sess.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION care_room_list_videos(p_session_token uuid)
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

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'description', v.description,
      'duration_seconds', v.duration_seconds,
      'uploaded_at', v.uploaded_at,
      'sort_order', v.sort_order
    ) ORDER BY v.sort_order DESC, v.uploaded_at DESC
  ), '[]'::jsonb)
  INTO v_videos
  FROM care_room_videos v
  WHERE v.room_id = v_sess.room_id AND v.is_published = true;

  RETURN v_videos;
END;
$$;

CREATE OR REPLACE FUNCTION care_room_logout(p_session_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM care_room_sessions WHERE id = p_session_token;
END;
$$;

-- ---------------------------------------------------------------------------
-- スタッフ向け RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION care_admin_set_room_password(p_room_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF p_password IS NULL OR length(trim(p_password)) < 4 THEN
    RAISE EXCEPTION 'password must be at least 4 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE care_member_rooms
  SET
    password_hash = crypt(trim(p_password), gen_salt('bf')),
    password_updated_at = now()
  WHERE id = p_room_id;

  -- パス変更時は既存セッションを無効化
  DELETE FROM care_room_sessions WHERE room_id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_create_room(
  p_member_name text,
  p_room_code text,
  p_password text,
  p_customer_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_code text;
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

  INSERT INTO care_member_rooms (member_name, room_code, customer_number, password_hash)
  VALUES (
    trim(p_member_name),
    v_code,
    NULLIF(trim(p_customer_number), ''),
    crypt(trim(p_password), gen_salt('bf'))
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION care_admin_generate_room_code(p_member_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_code text;
  v_try integer := 0;
BEGIN
  IF NOT care_is_staff() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;

  v_base := lower(regexp_replace(coalesce(p_member_name, 'room'), '[^a-zA-Z0-9]', '', 'g'));
  IF length(v_base) < 2 THEN
    v_base := 'room';
  END IF;
  v_base := left(v_base, 12);

  LOOP
    v_try := v_try + 1;
    v_code := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM care_member_rooms WHERE room_code = v_code);
    EXIT WHEN v_try > 20;
  END LOOP;

  RETURN v_code;
END;
$$;

-- 期限切れセッションの掃除（任意で cron から実行）
CREATE OR REPLACE FUNCTION care_cleanup_expired_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM care_room_sessions WHERE expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_validate_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_videos(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_logout(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_admin_set_room_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_create_room(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_admin_generate_room_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_is_staff() TO authenticated;
