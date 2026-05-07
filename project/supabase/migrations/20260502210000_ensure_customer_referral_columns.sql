/*
  # customers: 流入・主訴の列を揃える（本番で NewCustomerForm が弾かれる場合の救済）

  環境によっては referral_source のみ、または main_source / referral_source_id のみ、
  chief_complaint_* と complaint_* の片方、など列セットが異なる。ADD COLUMN IF NOT EXISTS で整合。
*/

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS referral_source_2 text,
  ADD COLUMN IF NOT EXISTS referral_source_id uuid,
  ADD COLUMN IF NOT EXISTS main_source text,
  ADD COLUMN IF NOT EXISTS chief_complaint_1 text,
  ADD COLUMN IF NOT EXISTS chief_complaint_2 text,
  ADD COLUMN IF NOT EXISTS chief_complaint_3 text,
  ADD COLUMN IF NOT EXISTS chief_complaint text,
  ADD COLUMN IF NOT EXISTS complaint_1 text,
  ADD COLUMN IF NOT EXISTS complaint_2 text,
  ADD COLUMN IF NOT EXISTS complaint_3 text;

NOTIFY pgrst, 'reload schema';
