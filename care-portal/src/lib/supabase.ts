import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

const supabaseUrl = rawUrl || 'https://env-not-configured.example.com';
const supabaseAnonKey = rawKey || 'env-not-configured-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function functionsBaseUrl(): string {
  const explicit = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
}
