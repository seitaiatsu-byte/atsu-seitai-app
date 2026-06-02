/*
  予約以外（空き・その他）枠用
  - entry_kind: appointment | vacant | other
  - customer_id は予約以外では NULL 可
  - block_title: カレンダー表示用ラベル（空き・会議など）
*/

ALTER TABLE public.appointment_reservations
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'appointment',
  ADD COLUMN IF NOT EXISTS block_title text;

ALTER TABLE public.appointment_reservations
  DROP CONSTRAINT IF EXISTS appointment_reservations_entry_kind_check;

ALTER TABLE public.appointment_reservations
  ADD CONSTRAINT appointment_reservations_entry_kind_check
  CHECK (entry_kind IN ('appointment', 'vacant', 'other'));

ALTER TABLE public.appointment_reservations
  ALTER COLUMN customer_id DROP NOT NULL;

UPDATE public.appointment_reservations
SET entry_kind = 'appointment'
WHERE entry_kind IS NULL OR entry_kind = '';

NOTIFY pgrst, 'reload schema';
