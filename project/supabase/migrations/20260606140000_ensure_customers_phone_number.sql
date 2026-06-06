/*
  # customers.phone_number を確実に存在させる

  本番 PostgREST の schema cache に phone_number が無い環境向け。
  適用後は Supabase Dashboard → Database → API → Reload schema を実行してください。
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN phone_number text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'phone'
  ) THEN
    EXECUTE $sql$
      UPDATE public.customers
      SET phone_number = COALESCE(NULLIF(TRIM(phone_number), ''), NULLIF(TRIM(phone), ''))
      WHERE phone_number IS NULL OR TRIM(phone_number) = ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'tel'
  ) THEN
    EXECUTE $sql$
      UPDATE public.customers
      SET phone_number = COALESCE(NULLIF(TRIM(phone_number), ''), NULLIF(TRIM(tel), ''))
      WHERE phone_number IS NULL OR TRIM(phone_number) = ''
    $sql$;
  END IF;
END $$;
