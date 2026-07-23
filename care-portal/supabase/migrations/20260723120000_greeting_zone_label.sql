-- あいさつ枠ラベル（会員画面の「🅰あいさつ」などの文言）

ALTER TABLE care_watch_ui_settings
  ADD COLUMN IF NOT EXISTS greeting_zone_label text NOT NULL DEFAULT 'あいさつ';

UPDATE care_watch_ui_settings
SET greeting_zone_label = coalesce(nullif(trim(greeting_zone_label), ''), 'あいさつ'),
    updated_at = now()
WHERE id = 1;

CREATE OR REPLACE FUNCTION care_room_get_greeting_zone_label(p_session_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT greeting_zone_label INTO v_label FROM care_watch_ui_settings WHERE id = 1;
  RETURN coalesce(nullif(trim(v_label), ''), 'あいさつ');
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_get_greeting_zone_label(uuid) TO anon, authenticated;
