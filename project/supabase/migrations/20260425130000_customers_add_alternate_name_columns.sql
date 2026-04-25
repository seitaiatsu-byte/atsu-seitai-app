/*
  顧客名簿の表記揺れ: kana, main_source, complaint_1..3
  既存は name_kana, referral_source, chief_complaint_* へもアプリは書き込む
*/
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS kana text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS main_source text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS complaint_1 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS complaint_2 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS complaint_3 text;

COMMENT ON COLUMN public.customers.kana IS '名簿CSVの kana 列用（正規列は name_kana）';
COMMENT ON COLUMN public.customers.main_source IS '流入 main（併用: referral_source）';
COMMENT ON COLUMN public.customers.complaint_1 IS '主訴1 短名（併用: chief_complaint_1）';
