import type { Database } from './database.types';
import { calculateAge, getCustomerBirthDate } from './customerBirthday';
import { CLINIC_FULL, resolveClinicNameByCustomerNumber, type ClinicFullName } from './clinic';
import type { CustomerRowRecord } from './customerRosterFieldResolve';
import {
  getComplaint1ForRoster,
  getComplaint2ForRoster,
  getComplaint3ForRoster,
  getInflowLineFromRoster,
} from './customerRosterFieldResolve';

type Customer = Database['public']['Tables']['customers']['Row'];

/** 空・空白のみなら null（「値なし」）。0 や "0" は有効。 */
export function nonEmptyTrim(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

/**
 * インポート汚染で "ー" / "---" だけ等が入っている行は、実質データなしとして扱う
 */
function meaningfulOnly(s: string | null | undefined): string | null {
  const t = nonEmptyTrim(s);
  if (t == null) return null;
  if (t === '...' || t === '…' || t === '---' || t === '--' || t === '－' || t === 'ー' || t === 'ｰ') {
    return null;
  }
  if (/^[-ー－ｰ―‐\s0]+$/u.test(t) && t.length < 2) return null;
  return t;
}

/**
 * 表示用の有効文字列。ダミー記号列は null（呼び出し元で '—' 等を出す）
 */
export function textForDisplay(s: string | null | undefined): string | null {
  return meaningfulOnly(s);
}

/**
 * 生年月日から年齢を出し、無ければ `age` 列（DB のみ・年齢 0 含む）を採用。
 * 各ソースは独立しており、他列が NULL でも有効な方だけ採用する。
 */
export function getAgeYearsFromCustomer(c: Customer): number | null {
  const fromBirth = calculateAge(getCustomerBirthDate(c));
  if (fromBirth != null) return fromBirth;
  if (c.age == null) return null;
  if (typeof c.age === 'number' && !Number.isNaN(c.age)) return c.age;
  return null;
}

/**
 * DB の院名が入っていればそれ。空なら顧客番号（1–4999=川西、5000～=高槻）で補完。
 */
export function getClinicNameForDisplay(c: Customer): ClinicFullName | null {
  const db = nonEmptyTrim(c.clinic_name);
  if (db) {
    if (db.includes('川西')) return CLINIC_FULL.kawanishi;
    if (db.includes('高槻')) return CLINIC_FULL.takatsuki;
    return db as ClinicFullName;
  }
  return resolveClinicNameByCustomerNumber(c.customer_number);
}

export function formatTableCell(
  s: string | null | undefined,
  empty: string = '—'
): string {
  return textForDisplay(s) ?? empty;
}

export function getChiefComplaint1Display(c: Customer): string | null {
  return getComplaint1ForRoster(c as CustomerRowRecord);
}

export function getChiefComplaint2Display(c: Customer): string | null {
  return getComplaint2ForRoster(c as CustomerRowRecord);
}

export function getChiefComplaint3Display(c: Customer): string | null {
  return getComplaint3ForRoster(c as CustomerRowRecord);
}

const ROSTER_PHONE_KEYS = ['phone_number', 'phone', 'mobile', 'tel', 'TEL', 'phoneNumber'] as const;

/** 名簿に「空欄扱い」にする表記（実番号以外） */
function isRosterPhonePlaceholder(s: string): boolean {
  const t = s.replace(/\u00a0/g, ' ').trim();
  if (t === '') return true;
  const lower = t.toLowerCase();
  if (
    t === 'ー' ||
    t === '－' ||
    t === '-' ||
    t === '---' ||
    t === '--' ||
    t === '…' ||
    t === '...' ||
    lower === 'n/a' ||
    lower === 'na' ||
    t === 'なし' ||
    t === '同上' ||
    t === '同左' ||
    t === '未入力' ||
    t === '未登録' ||
    t === '空' ||
    t === '無' ||
    t === '同じ'
  ) {
    return true;
  }
  if (/^[-ー－\s.・。ｰー]+$/u.test(t) && t.length < 3) return true;
  return false;
}

/**
 * 顧客名簿上の「電話」1列用。Postgres が text / 全角 / 数値型で返っても表示する（meaningfulOnly は通さない）。
 * 主な値は `phone_number`。本番DBで列名が異なる場合は `phoneFromCustomerRosterRow` のキー一覧に追加。
 */
export function phoneFromCustomerRoster(phone: unknown): string | null {
  if (phone == null) return null;
  const raw = String(phone)
    .replace(/\u00a0/g, ' ')
    .trim();
  if (raw === '') return null;
  const n = raw.normalize('NFKC');
  if (isRosterPhonePlaceholder(n) || isRosterPhonePlaceholder(raw)) return null;
  const half = n.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const digits = half.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length >= 8) {
    return half.replace(/\s+/g, ' ').trim() || n.trim();
  }
  if (isRosterPhonePlaceholder(half) || isRosterPhonePlaceholder(n)) return null;
  return half.replace(/\s+/g, ' ').trim() || n.trim();
}

/**
 * `customers` 行から名簿上の電話。Supabase/移行先で `phone` 等の列名差があっても先に当てる。
 */
export function phoneFromCustomerRosterRow(
  c: Customer & Record<string, unknown>
): string | null {
  const row = c as Record<string, unknown>;
  for (const k of ROSTER_PHONE_KEYS) {
    const v = row[k];
    if (v == null) continue;
    if (v === '' || (typeof v === 'string' && v.trim() === '')) continue;
    const p = phoneFromCustomerRoster(v);
    if (p) return p;
  }
  return null;
}

/**
 * 自由文から国内向けらしき電話（顧客メモ・来院メモ用）
 */
export function extractPhoneFromFreeText(s: string | null | undefined): string | null {
  const t = nonEmptyTrim(s);
  if (!t) return null;
  const hw = t.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const pats: RegExp[] = [
    /0[789]0[-ー－\s]?\d{1,4}[-ー－\s]?\d{3,5}/,
    /0[1-9]\d{0,3}[-ー－\s]?\d{1,4}[-ー－\s]?\d{3,5}/,
    /0\d{9,11}/,
  ];
  for (const re of pats) {
    const m = hw.match(re);
    if (m) {
      const g = m[0].replace(/\s+/g, '').replace(/[ー－]/g, '-');
      const digits = g.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 12) return g;
    }
  }
  return null;
}

export type PhoneFallbackMeta = { value: string | null; fromRoster: boolean };

/**
 * 1) 顧客名簿の列だけを最優先。2) それで無いときだけメモ・住所・来院メモから抜粋
 */
export function getPhoneWithFallbackMeta(
  c: Customer,
  visitMemos: (string | null | undefined)[] = []
): PhoneFallbackMeta {
  const roster = phoneFromCustomerRosterRow(c as Customer & Record<string, unknown>);
  if (roster) return { value: roster, fromRoster: true };
  for (const field of [c.memo, c.address, ...visitMemos]) {
    const f = extractPhoneFromFreeText(field);
    if (f) return { value: f, fromRoster: false };
  }
  return { value: null, fromRoster: false };
}

export function getPhoneWithMemoFallback(
  c: Customer,
  visitMemos: (string | null | undefined)[] = []
): string | null {
  return getPhoneWithFallbackMeta(c, visitMemos).value;
}

type VisitInflow = { import_kind_text: string | null; visit_date: string; menu_name: string | null; memo: string | null };

/** 顧客行が空のとき、来院取込（種類列）を流入の補完として使う */
export function getInflowLineForChart(
  c: Customer,
  refFromMaster: string | null,
  visitsByNewest: VisitInflow[]
): { line: string | null; note: 'customer' | 'master' | 'visit' | null } {
  const fromRoster = getInflowLineFromRoster(c as CustomerRowRecord);
  if (fromRoster) return { line: fromRoster, note: 'customer' };
  if (refFromMaster) return { line: refFromMaster, note: 'master' };
  for (const v of visitsByNewest) {
    const k = meaningfulOnly(v.import_kind_text);
    if (k) return { line: k, note: 'visit' };
  }
  return { line: null, note: null };
}

/** 主訴列が空のとき、直近来院の実施メニュー名を主訴1の補完（テーブルに主訴が未登録のとき用） */
export function getChiefTripletWithVisitMenu(
  c: Customer,
  visitNewestFirst: { menu_name: string | null; memo: string | null }[]
): [string | null, string | null, string | null] {
  const c1 = getChiefComplaint1Display(c);
  const c2 = getChiefComplaint2Display(c);
  const c3 = getChiefComplaint3Display(c);
  let m1 = c1;
  if (!m1) {
    for (const v of visitNewestFirst) {
      const mn = meaningfulOnly(v.menu_name);
      if (mn) {
        m1 = mn;
        break;
      }
    }
  }
  return [m1, c2, c3];
}
