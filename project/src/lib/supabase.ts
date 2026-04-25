import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** 本番 Vercel など、.env 未投入でも判別用に使う */
export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

/**
 * createClient は URL/キーが空だと即 throw するため、未設定時は形式だけ満たすプレースホルダに差し替え、
 * 実際の接続は isSupabaseConfigured ガード＋ Vercel の VITE_* 設定に任せる。
 */
const supabaseUrl = rawUrl || 'https://env-not-configured.example.com';
const supabaseAnonKey = rawKey || 'env-not-configured-anon-key';

if (import.meta.env.DEV && !isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です。project/.env を作成し、.env.example を参照してください。'
  );
}
if (import.meta.env.PROD && !isSupabaseConfigured) {
  console.error(
    '[supabase] 本番: Vercel → Settings → Environment Variables に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を入れ、Redeploy してください。'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
