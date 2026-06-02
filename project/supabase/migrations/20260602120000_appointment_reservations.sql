/*
  予約確認表（月間カレンダー）用テーブル
  来院記録とは別管理。来院入力連動時に visit_record_id / status を更新可能。
*/

CREATE TABLE IF NOT EXISTS public.appointment_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reservation_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  clinic_name text,
  memo text,
  status text NOT NULL DEFAULT 'scheduled',
  visit_record_id uuid REFERENCES public.visit_records(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT appointment_reservations_status_check
    CHECK (status IN ('scheduled', 'visited', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_reservations_date
  ON public.appointment_reservations (reservation_date);

CREATE INDEX IF NOT EXISTS idx_appointment_reservations_customer
  ON public.appointment_reservations (customer_id);

ALTER TABLE public.appointment_reservations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointment_reservations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointment_reservations', pol.policyname);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_reservations TO anon, authenticated, service_role;

CREATE POLICY app_appointment_reservations_select ON public.appointment_reservations
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY app_appointment_reservations_insert ON public.appointment_reservations
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY app_appointment_reservations_update ON public.appointment_reservations
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_appointment_reservations_delete ON public.appointment_reservations
  FOR DELETE TO anon, authenticated USING (true);

NOTIFY pgrst, 'reload schema';
