import { normalizePhoneDigitsForDb } from './customerImportHelpers';

const PHONE_READ_KEYS = ['phone_number', 'phone', 'mobile', 'tel', 'TEL', 'phoneNumber'] as const;

/** DB 環境差に合わせて順に試す電話列（本番は phone_number が正だが無い環境も救済） */
export const CUSTOMER_PHONE_WRITE_KEYS = ['phone_number', 'phone', 'tel', 'mobile', 'TEL', 'phoneNumber'] as const;

export function isCustomerPhoneColumn(col: string): boolean {
  return (CUSTOMER_PHONE_WRITE_KEYS as readonly string[]).includes(col);
}

/** 電話列は候補を順に試すため個別保護しない */
export const CUSTOMER_PHONE_PROTECTED_COLUMNS = new Set<string>();

/** 顧客行から電話番号を読み取る（列名の揺れに対応） */
export function readPhoneFromCustomerRow(row: Record<string, unknown>): string {
  for (const key of PHONE_READ_KEYS) {
    const raw = row[key];
    if (raw == null) continue;
    const digits = String(raw).replace(/[^\d]/g, '');
    if (digits.length > 0) return digits;
  }
  return '';
}

function clearPhoneKeys(payload: Record<string, unknown>): void {
  for (const key of CUSTOMER_PHONE_WRITE_KEYS) {
    delete payload[key];
  }
}

/** insert/update 用 payload に電話を反映（まず phone_number のみ。無ければリトライで別名を試す） */
export function applyPhoneToCustomerPayload(
  payload: Record<string, unknown>,
  raw: string | null | undefined
): void {
  clearPhoneKeys(payload);
  const phoneNorm = normalizePhoneDigitsForDb(raw);
  if (!phoneNorm) return;
  payload.phone_number = phoneNorm;
}

/**
 * スキーマに無い電話列エラー時: 落として次の候補列へ切り替える。
 * @returns true = リトライ継続、false = 電話列以外
 */
export function retryAfterMissingPhoneColumn(
  work: Record<string, unknown>,
  missingCol: string,
  phoneRaw: string | null | undefined
): boolean {
  if (!isCustomerPhoneColumn(missingCol)) return false;

  delete work[missingCol];
  const phoneNorm = normalizePhoneDigitsForDb(phoneRaw);
  if (!phoneNorm) return true;

  const failedIdx = CUSTOMER_PHONE_WRITE_KEYS.indexOf(
    missingCol as (typeof CUSTOMER_PHONE_WRITE_KEYS)[number]
  );
  const start = failedIdx >= 0 ? failedIdx + 1 : 0;
  for (let i = start; i < CUSTOMER_PHONE_WRITE_KEYS.length; i++) {
    const key = CUSTOMER_PHONE_WRITE_KEYS[i];
    if (!(key in work)) {
      work[key] = phoneNorm;
      return true;
    }
  }
  return true;
}
