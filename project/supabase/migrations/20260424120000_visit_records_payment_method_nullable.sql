-- CSV インポート: 5列目（支払）未照合時に null を入れられるようにする
ALTER TABLE public.visit_records
  ALTER COLUMN payment_method DROP NOT NULL,
  ALTER COLUMN payment_method DROP DEFAULT;

COMMENT ON COLUMN public.visit_records.payment_method IS '支払方法マスタ id（文字列）／未解決の取り込みは null 可';
