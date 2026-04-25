-- CSV 6列目「種類」をマスタ照合なしで保存（テキスト）
ALTER TABLE public.visit_records
  ADD COLUMN IF NOT EXISTS import_kind_text text;

COMMENT ON COLUMN public.visit_records.import_kind_text IS 'CSVインポート時のF列（種類）生文字列。payment_detail_id は併用可';
