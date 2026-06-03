/** 分析・名簿で「患者」として扱う顧客番号の範囲 */
export const REAL_CUSTOMER_NUMBER_MIN = 1;
export const REAL_CUSTOMER_NUMBER_MAX = 9999;

/** 予約カレンダー用の仮顧客（1件だけ登録） */
export const PLACEHOLDER_CUSTOMER_NUMBER = '10000';
export const PLACEHOLDER_CUSTOMER_NAME = '新規仮';

export function parseCustomerNumberValue(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const num = parseInt(String(raw).trim().replace(/\D/g, ''), 10);
  return Number.isFinite(num) ? num : null;
}

export function isPlaceholderCustomerNumber(raw: string | null | undefined): boolean {
  const num = parseCustomerNumberValue(raw);
  return num !== null && num >= 10000;
}

export function isRealCustomerNumber(raw: string | null | undefined): boolean {
  const num = parseCustomerNumberValue(raw);
  return num !== null && num >= REAL_CUSTOMER_NUMBER_MIN && num <= REAL_CUSTOMER_NUMBER_MAX;
}

export function filterRealCustomers<T extends { customer_number?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => isRealCustomerNumber(r.customer_number));
}

export function placeholderCustomerIds(
  rows: Array<{ id: string; customer_number?: string | null }>
): Set<string> {
  return new Set(rows.filter((r) => isPlaceholderCustomerNumber(r.customer_number)).map((r) => r.id));
}

/** 新規登録の自動採番（1–9999 の最大+1。10000 以上は見ない） */
export function resolveNextRealCustomerNumber(numbers: string[]): string {
  const nums = numbers
    .map((s) => parseCustomerNumberValue(s))
    .filter((n): n is number => n !== null && n >= REAL_CUSTOMER_NUMBER_MIN && n <= REAL_CUSTOMER_NUMBER_MAX);
  const max = nums.length ? Math.max(...nums) : 0;
  const next = max + 1;
  if (next > REAL_CUSTOMER_NUMBER_MAX) {
    throw new Error('利用可能な顧客番号（1–9999）がありません');
  }
  return String(next);
}
