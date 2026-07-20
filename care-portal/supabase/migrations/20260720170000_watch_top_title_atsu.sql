-- 会員画面 TOP タイトルを「あつ整体院」に統一

UPDATE care_watch_ui_settings
SET top_title = 'あつ整体院', updated_at = now()
WHERE id = 1;

ALTER TABLE care_watch_ui_settings
  ALTER COLUMN top_title SET DEFAULT 'あつ整体院';

CREATE OR REPLACE FUNCTION care_room_get_watch_top_title(p_session_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_title text;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT top_title INTO v_title FROM care_watch_ui_settings WHERE id = 1;
  RETURN coalesce(nullif(trim(v_title), ''), 'あつ整体院');
END;
$$;
