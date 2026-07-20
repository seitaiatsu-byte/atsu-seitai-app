-- safeupdate 対策：プログラム定義保存時の全ルーム更新に WHERE を付与

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

  -- 間隔変更を既存ルームの次回更新日に反映（WHERE 必須：safeupdate 対策）
  UPDATE care_member_rooms r
  SET next_password_rotation_at = care_compute_next_password_rotation(r.password_updated_at, r.program_tier)
  WHERE r.id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION care_admin_save_program_defs(jsonb) TO authenticated;
