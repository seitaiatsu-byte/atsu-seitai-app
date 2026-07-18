-- 健康への勉強部屋（全院共通・資料：リンク／画像／PDF）

-- ---------------------------------------------------------------------------
-- 部屋名設定（1行固定）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_study_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title text NOT NULL DEFAULT '健康への勉強部屋',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE care_study_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_study_settings_staff_all ON care_study_settings;
CREATE POLICY care_study_settings_staff_all ON care_study_settings
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

INSERT INTO care_study_settings (id, title) VALUES (1, '健康への勉強部屋')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 資料アイテム
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_study_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  external_url text,
  storage_path text,
  file_size bigint,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_study_items_type_check CHECK (item_type IN ('link', 'image', 'pdf')),
  CONSTRAINT care_study_items_payload_check CHECK (
    (item_type = 'link' AND external_url IS NOT NULL AND length(trim(external_url)) > 0)
    OR (item_type IN ('image', 'pdf') AND storage_path IS NOT NULL AND length(trim(storage_path)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS care_study_items_published_idx
  ON care_study_items (is_published, sort_order DESC, created_at DESC);

ALTER TABLE care_study_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_study_items_staff_all ON care_study_items;
CREATE POLICY care_study_items_staff_all ON care_study_items
  FOR ALL TO authenticated
  USING (care_is_staff())
  WITH CHECK (care_is_staff());

-- ---------------------------------------------------------------------------
-- Storage: care-materials（画像・PDF）
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'care-materials',
  'care-materials',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS care_materials_storage_staff_insert ON storage.objects;
CREATE POLICY care_materials_storage_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'care-materials' AND care_is_staff());

DROP POLICY IF EXISTS care_materials_storage_staff_update ON storage.objects;
CREATE POLICY care_materials_storage_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'care-materials' AND care_is_staff())
  WITH CHECK (bucket_id = 'care-materials' AND care_is_staff());

DROP POLICY IF EXISTS care_materials_storage_staff_delete ON storage.objects;
CREATE POLICY care_materials_storage_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'care-materials' AND care_is_staff());

DROP POLICY IF EXISTS care_materials_storage_staff_select ON storage.objects;
CREATE POLICY care_materials_storage_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'care-materials' AND care_is_staff());

-- ---------------------------------------------------------------------------
-- 会員：勉強部屋の概要（タイトル＋件数）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_get_study_room(p_session_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess care_room_sessions%ROWTYPE;
  v_title text;
  v_count int;
BEGIN
  SELECT * INTO v_sess
  FROM care_room_sessions
  WHERE id = p_session_token AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = '28000';
  END IF;

  SELECT title INTO v_title FROM care_study_settings WHERE id = 1;
  IF v_title IS NULL OR trim(v_title) = '' THEN
    v_title := '健康への勉強部屋';
  END IF;

  SELECT count(*)::int INTO v_count
  FROM care_study_items
  WHERE is_published = true;

  RETURN jsonb_build_object(
    'title', v_title,
    'item_count', LEAST(99, coalesce(v_count, 0))
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 会員：資料一覧
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION care_room_list_study_items(p_session_token uuid)
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
      'id', i.id,
      'item_type', i.item_type,
      'title', i.title,
      'external_url', i.external_url,
      'has_file', (i.storage_path IS NOT NULL),
      'created_at', i.created_at,
      'sort_order', i.sort_order
    ) ORDER BY i.sort_order DESC, i.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM care_study_items i
  WHERE i.is_published = true;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION care_room_get_study_room(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION care_room_list_study_items(uuid) TO anon, authenticated;
