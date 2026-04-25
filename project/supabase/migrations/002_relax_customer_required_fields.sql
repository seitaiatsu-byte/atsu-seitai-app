-- 顧客登録の必須項目を最小化（氏名・ふりがなのみ）
-- 既存DBに NOT NULL 制約が残っている場合の救済用

ALTER TABLE public.customers
  ALTER COLUMN phone_number DROP NOT NULL,
  ALTER COLUMN customer_number DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL,
  ALTER COLUMN birth_date DROP NOT NULL,
  ALTER COLUMN birthday DROP NOT NULL,
  ALTER COLUMN age DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL,
  ALTER COLUMN memo DROP NOT NULL,
  ALTER COLUMN clinic_name DROP NOT NULL,
  ALTER COLUMN prefecture DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL,
  ALTER COLUMN town DROP NOT NULL,
  ALTER COLUMN referral_source DROP NOT NULL,
  ALTER COLUMN referral_source_id DROP NOT NULL,
  ALTER COLUMN first_visit_date DROP NOT NULL,
  ALTER COLUMN chief_complaint DROP NOT NULL,
  ALTER COLUMN chief_complaint_1 DROP NOT NULL,
  ALTER COLUMN chief_complaint_2 DROP NOT NULL,
  ALTER COLUMN chief_complaint_3 DROP NOT NULL,
  ALTER COLUMN points DROP NOT NULL;

-- 最低限の必須を明示（念のため）
ALTER TABLE public.customers
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN name_kana SET NOT NULL;

