-- 来院 CSV の F列（種類）が payment_detail_master と照合できるよう、代表3語を常に有効行として揃える
-- （過去に is_active を false にした行だけ残っていると、is_active 絞り照合で取りこぼしていた）

DO $$
DECLARE
  mx int;
BEGIN
  SELECT COALESCE(MAX(display_order), 0) INTO mx FROM payment_detail_master;

  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '事前精算') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('事前精算', mx, true);
  ELSE
    UPDATE payment_detail_master SET is_active = true WHERE trim(name) = '事前精算' AND (is_active IS DISTINCT FROM true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '当日精算') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('当日精算', mx, true);
  ELSE
    UPDATE payment_detail_master SET is_active = true WHERE trim(name) = '当日精算' AND (is_active IS DISTINCT FROM true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM payment_detail_master WHERE trim(name) = '事前精算＋当日精算') THEN
    mx := mx + 1;
    INSERT INTO payment_detail_master (name, display_order, is_active) VALUES ('事前精算＋当日精算', mx, true);
  ELSE
    UPDATE payment_detail_master SET is_active = true WHERE trim(name) = '事前精算＋当日精算' AND (is_active IS DISTINCT FROM true);
  END IF;
END $$;
