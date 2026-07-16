-- Supabase では pgcrypto が extensions スキーマにあるため、関数を修正
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION care_admin_create_room(
  p_member_name text,
  p_room_code text,
  p_password text,
  p_customer_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
  )
  RETURNING id INTO v_id;

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
  IF p_password IS NULL OR length(trim(p_password)) < 4 THEN
    RAISE EXCEPTION 'password must be at least 4 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE care_member_rooms
  SET
    password_hash = extensions.crypt(trim(p_password), extensions.gen_salt('bf')),
    password_updated_at = now()
  WHERE id = p_room_id;

  DELETE FROM care_room_sessions WHERE room_id = p_room_id;
END;
$$;

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
    'expires_at', v_expires
  );
END;
$$;
