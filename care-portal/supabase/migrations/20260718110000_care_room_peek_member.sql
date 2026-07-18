-- 入室画面用：部屋コードから会員氏名だけ取得（パスワード不要）

CREATE OR REPLACE FUNCTION care_room_peek_member(p_room_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF p_room_code IS NULL OR trim(p_room_code) = '' THEN
    RAISE EXCEPTION 'room_code is required' USING ERRCODE = '22023';
  END IF;

  SELECT member_name INTO v_name
  FROM care_member_rooms
  WHERE room_code = lower(trim(p_room_code))
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('member_name', null, 'found', false);
  END IF;

  RETURN jsonb_build_object('member_name', v_name, 'found', true);
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_peek_member(text) TO anon, authenticated;
