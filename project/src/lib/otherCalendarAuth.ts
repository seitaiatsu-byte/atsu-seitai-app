import { supabase } from './supabase';

const STORAGE_KEY = 'other_calendar_unlocked_v1';

export function isOtherCalendarUnlocked(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOtherCalendarUnlocked(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearOtherCalendarUnlock(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** DB（経営ルール）→ 環境変数 VITE_OTHER_CALENDAR_PASSWORD の順で参照 */
export async function fetchOtherCalendarPassword(): Promise<string> {
  const { data, error } = await supabase
    .from('business_rules')
    .select('rule_value')
    .eq('rule_key', 'other_calendar_password')
    .maybeSingle();
  if (!error) {
    const db = String(data?.rule_value || '').trim();
    if (db) return db;
  }
  const env = import.meta.env.VITE_OTHER_CALENDAR_PASSWORD;
  return typeof env === 'string' ? env.trim() : '';
}

export function verifyOtherCalendarPassword(input: string, expected: string): boolean {
  return input.trim() === expected.trim() && expected.trim().length > 0;
}
