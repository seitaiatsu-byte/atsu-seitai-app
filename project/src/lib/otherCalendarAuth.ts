import { supabase } from './supabase';

const STORAGE_KEY = 'other_calendar_unlocked_v1';
const RULE_PASSWORD = 'other_calendar_password';
const RULE_RECOVERY = 'other_calendar_recovery_phrase';

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

function normalizeSecret(s: string): string {
  return s.trim();
}

async function fetchRuleValue(ruleKey: string): Promise<string> {
  const { data, error } = await supabase
    .from('business_rules')
    .select('rule_value')
    .eq('rule_key', ruleKey)
    .maybeSingle();
  if (error) throw error;
  return normalizeSecret(String(data?.rule_value || ''));
}

async function upsertRuleValue(ruleKey: string, value: string, description: string): Promise<void> {
  const { error } = await supabase.from('business_rules').upsert(
    { rule_key: ruleKey, rule_value: value, description },
    { onConflict: 'rule_key' }
  );
  if (error) throw error;
}

/** DB（経営ルール）→ 環境変数 VITE_OTHER_CALENDAR_PASSWORD の順で参照 */
export async function fetchOtherCalendarPassword(): Promise<string> {
  try {
    const db = await fetchRuleValue(RULE_PASSWORD);
    if (db) return db;
  } catch {
    // fall through to env
  }
  const env = import.meta.env.VITE_OTHER_CALENDAR_PASSWORD;
  return typeof env === 'string' ? normalizeSecret(env) : '';
}

export async function fetchOtherCalendarRecoveryPhrase(): Promise<string> {
  return fetchRuleValue(RULE_RECOVERY);
}

export async function isOtherCalendarPasswordConfigured(): Promise<boolean> {
  return (await fetchOtherCalendarPassword()).length > 0;
}

export function verifyOtherCalendarPassword(input: string, expected: string): boolean {
  const a = normalizeSecret(input);
  const b = normalizeSecret(expected);
  return a.length > 0 && b.length > 0 && a === b;
}

export function verifyOtherCalendarRecoveryPhrase(input: string, expected: string): boolean {
  const a = normalizeSecret(input);
  const b = normalizeSecret(expected);
  return a.length > 0 && b.length > 0 && a === b;
}

/** 初回：入室パスワード＋合言葉を登録 */
export async function saveOtherCalendarPasswordInitial(
  newPassword: string,
  recoveryPhrase: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const configured = await isOtherCalendarPasswordConfigured();
  if (configured) {
    return { ok: false, message: 'すでにパスワードが設定されています。変更の欄を使ってください。' };
  }
  const pw = normalizeSecret(newPassword);
  const phrase = normalizeSecret(recoveryPhrase);
  if (pw.length < 4) return { ok: false, message: '入室パスワードは4文字以上にしてください。' };
  if (phrase.length < 4) return { ok: false, message: '合言葉は4文字以上にしてください。' };

  try {
    await upsertRuleValue(RULE_PASSWORD, pw, '予約カレンダー「予約以外」タブの入室パスワード');
    await upsertRuleValue(RULE_RECOVERY, phrase, '予約カレンダー「予約以外」タブ：パスワード確認用の合言葉');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '保存に失敗しました' };
  }
}

/** 変更：現在のパスワード確認後に更新 */
export async function changeOtherCalendarPassword(opts: {
  currentPassword: string;
  newPassword: string;
  newRecoveryPhrase?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const current = await fetchOtherCalendarPassword();
  if (!current) return { ok: false, message: 'パスワードが未設定です。初回設定の欄から登録してください。' };
  if (!verifyOtherCalendarPassword(opts.currentPassword, current)) {
    return { ok: false, message: '現在のパスワードが違います。' };
  }

  const pw = normalizeSecret(opts.newPassword);
  if (pw.length < 4) return { ok: false, message: '新しい入室パスワードは4文字以上にしてください。' };

  const phraseInput = opts.newRecoveryPhrase !== undefined ? normalizeSecret(opts.newRecoveryPhrase) : null;
  if (phraseInput !== null && phraseInput.length > 0 && phraseInput.length < 4) {
    return { ok: false, message: '新しい合言葉は4文字以上にするか、空欄のままにしてください。' };
  }

  const existingRecovery = await fetchOtherCalendarRecoveryPhrase();
  if (!existingRecovery && (!phraseInput || phraseInput.length < 4)) {
    return {
      ok: false,
      message: '合言葉が未登録です。合言葉欄に4文字以上を入力して保存してください（忘れたときの確認用）。',
    };
  }

  try {
    await upsertRuleValue(RULE_PASSWORD, pw, '予約カレンダー「予約以外」タブの入室パスワード');
    if (phraseInput !== null && phraseInput.length > 0) {
      await upsertRuleValue(RULE_RECOVERY, phraseInput, '予約カレンダー「予約以外」タブ：パスワード確認用の合言葉');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '変更に失敗しました' };
  }
}

/** 合言葉が一致したときだけ入室パスワードを返す */
export async function revealOtherCalendarPasswordByRecovery(
  recoveryPhrase: string
): Promise<{ ok: true; password: string } | { ok: false; message: string }> {
  const expectedPhrase = await fetchOtherCalendarRecoveryPhrase();
  if (!expectedPhrase) {
    return { ok: false, message: '合言葉が未設定です。経営ルール設定で合言葉を登録してください。' };
  }
  if (!verifyOtherCalendarRecoveryPhrase(recoveryPhrase, expectedPhrase)) {
    return { ok: false, message: '合言葉が違います。' };
  }
  const password = await fetchOtherCalendarPassword();
  if (!password) return { ok: false, message: '入室パスワードが未設定です。' };
  return { ok: true, password };
}
