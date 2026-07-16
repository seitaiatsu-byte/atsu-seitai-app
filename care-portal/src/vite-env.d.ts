/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_CLINIC_HELP_PHONE?: string;
  readonly VITE_SUPABASE_FUNCTIONS_URL?: string;
  /** 会員に渡すQR・URLの本番ドメイン（例: https://a2karada.jp） */
  readonly VITE_PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
