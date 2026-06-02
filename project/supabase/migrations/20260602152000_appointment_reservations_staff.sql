/*
  予約確認表のスタッフ選択・重複チェック用
  - staff_id: staff_master への参照
  - staff_name: 表示・履歴確認用のスタッフ名スナップショット
*/

ALTER TABLE public.appointment_reservations
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_name text;

CREATE INDEX IF NOT EXISTS idx_appointment_reservations_staff_date
  ON public.appointment_reservations (staff_id, reservation_date);

NOTIFY pgrst, 'reload schema';
