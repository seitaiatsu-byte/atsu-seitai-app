-- 挨拶動画マスター（A/B・全院共通）

CREATE TABLE IF NOT EXISTS care_greeting_videos (
  slot_code text PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  storage_path text,
  file_size bigint,
  is_published boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_greeting_slot_code CHECK (slot_code IN ('A', 'B'))
);

CREATE UNIQUE INDEX IF NOT EXISTS care_greeting_videos_id_idx ON care_greeting_videos (id);

ALTER TABLE care_greeting_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_greeting_videos_staff_all ON care_greeting_videos;
CREATE POLICY care_greeting_videos_staff_all ON care_greeting_videos
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

INSERT INTO care_greeting_videos (slot_code, title) VALUES
  ('A', '挨拶動画A'),
  ('B', '会員以外への動画')
ON CONFLICT (slot_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 会員：挨拶動画一覧（A/B）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_list_greeting_videos(p_session_token uuid)
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
      'slot_code', g.slot_code,
      'id', g.id,
      'title', g.title,
      'has_video', (g.storage_path IS NOT NULL AND g.is_published = true),
      'uploaded_at', g.uploaded_at
    ) ORDER BY g.slot_code
  ), '[]'::jsonb)
  INTO v_result
  FROM care_greeting_videos g;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_list_greeting_videos(uuid) TO anon, authenticated;
