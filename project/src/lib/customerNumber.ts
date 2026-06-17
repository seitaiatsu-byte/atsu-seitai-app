/** 分析・名簿で「患者」として扱う顧客番号の範囲 */
export const REAL_CUSTOMER_NUMBER_MIN = 1;
export const REAL_CUSTOMER_NUMBER_MAX = 9999;

/** 予約カレンダー用の仮顧客（1件だけ登録） */
export const PLACEHOLDER_CUSTOMER_NUMBER = '10000';
export const PLACEHOLDER_CUSTOMER_NAME = '新規仮';

export const CUSTOMER_NUMBER_BANDS = {
  kawanishi_be: {
    min: 1,
    max: 3999,
    label: '川西 BE',
    shortLabel: '川西BE',
    clinicHint: '川西あつ整体院',
  },
  kawanishi_fe: {
    min: 4000,
    max: 4999,
    label: '川西 FE',
    shortLabel: '川西FE',
    clinicHint: '川西あつ整体院',
  },
  takatsuki: {
    min: 5000,
    max: 9999,
    label: '高槻',
    shortLabel: '高槻',
    clinicHint: '高槻あつ整体院',
  },
} as const;

export type CustomerNumberBand = keyof typeof CUSTOMER_NUMBER_BANDS;

export type BandUsageRow = {
  band: CustomerNumberBand;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  count: number;
  maxUsed: number | null;
  next: number | null;
  full: boolean;
};

export function parseCustomerNumberValue(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const num = parseInt(String(raw).trim().replace(/\D/g, ''), 10);
  return Number.isFinite(num) ? num : null;
}

export function customerNumberBand(num: number): CustomerNumberBand | null {
  if (num >= CUSTOMER_NUMBER_BANDS.kawanishi_be.min && num <= CUSTOMER_NUMBER_BANDS.kawanishi_be.max) {
    return 'kawanishi_be';
  }
  if (num >= CUSTOMER_NUMBER_BANDS.kawanishi_fe.min && num <= CUSTOMER_NUMBER_BANDS.kawanishi_fe.max) {
    return 'kawanishi_fe';
  }
  if (num >= CUSTOMER_NUMBER_BANDS.takatsuki.min && num <= CUSTOMER_NUMBER_BANDS.takatsuki.max) {
    return 'takatsuki';
  }
  return null;
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

function numbersInBand(numbers: string[], band: CustomerNumberBand): number[] {
  const meta = CUSTOMER_NUMBER_BANDS[band];
  return numbers
    .map((s) => parseCustomerNumberValue(s))
    .filter((n): n is number => n !== null && n >= meta.min && n <= meta.max);
}

export function summarizeCustomerNumberBands(numbers: string[]): BandUsageRow[] {
  return (Object.keys(CUSTOMER_NUMBER_BANDS) as CustomerNumberBand[]).map((band) => {
    const meta = CUSTOMER_NUMBER_BANDS[band];
    const inBand = numbersInBand(numbers, band);
    const maxUsed = inBand.length ? Math.max(...inBand) : null;
    const nextCandidate = maxUsed === null ? meta.min : maxUsed + 1;
    const full = nextCandidate > meta.max;
    return {
      band,
      label: meta.label,
      shortLabel: meta.shortLabel,
      min: meta.min,
      max: meta.max,
      count: inBand.length,
      maxUsed,
      next: full ? null : nextCandidate,
      full,
    };
  });
}

/** 帯ごとの自動採番（川西BE / 川西FE / 高槻） */
export function resolveNextNumberInBand(numbers: string[], band: CustomerNumberBand): string {
  const meta = CUSTOMER_NUMBER_BANDS[band];
  const inBand = numbersInBand(numbers, band);
  const maxUsed = inBand.length ? Math.max(...inBand) : meta.min - 1;
  const next = maxUsed + 1;
  if (next > meta.max) {
    throw new Error(`${meta.label}（${meta.min}〜${meta.max}）に空き番号がありません`);
  }
  return String(next);
}

/** @deprecated 全院横断の最大+1。新規登録では帯別採番を使う */
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

/** 高槻5500番台以上 → 川西BE(大→小) → 高槻5499以下 → FE(大→小) */
export const TAKATSUKI_HIGH_SORT_MIN = 5500;

export function customerNumberDisplaySortGroup(num: number | null): number {
  if (num === null) return 90;
  if (num >= 10000) return 100;
  if (num >= TAKATSUKI_HIGH_SORT_MIN && num <= CUSTOMER_NUMBER_BANDS.takatsuki.max) return 0;
  if (num >= CUSTOMER_NUMBER_BANDS.kawanishi_be.min && num <= CUSTOMER_NUMBER_BANDS.kawanishi_be.max) return 1;
  if (num >= CUSTOMER_NUMBER_BANDS.takatsuki.min && num < TAKATSUKI_HIGH_SORT_MIN) return 2;
  if (num >= CUSTOMER_NUMBER_BANDS.kawanishi_fe.min && num <= CUSTOMER_NUMBER_BANDS.kawanishi_fe.max) return 3;
  return 50;
}

export function compareCustomerNumberForSearchDisplay(a: number | null, b: number | null): number {
  const ga = customerNumberDisplaySortGroup(a);
  const gb = customerNumberDisplaySortGroup(b);
  if (ga !== gb) return ga - gb;
  const na = a ?? -1;
  const nb = b ?? -1;
  return nb - na;
}

export function compareCustomersForSearchDisplay(
  a: { customer_number?: string | null; name?: string | null },
  b: { customer_number?: string | null; name?: string | null }
): number {
  const an = parseCustomerNumberValue(a.customer_number);
  const bn = parseCustomerNumberValue(b.customer_number);
  const byNum = compareCustomerNumberForSearchDisplay(an, bn);
  if (byNum !== 0) return byNum;
  return (a.name || '').localeCompare(b.name || '', 'ja');
}
