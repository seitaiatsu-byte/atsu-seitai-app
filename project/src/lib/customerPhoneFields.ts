import { normalizePhoneDigitsForDb } from './customerImportHelpers';

const PHONE_READ_KEYS = ['phone_number', 'phone', 'mobile', 'tel', 'TEL', 'phoneNumber'] as const;

/** insert/update リトライで誤って落とさない電話列（本番DBは phone_number のみ） */
export const CUSTOMER_PHONE_PROTECTED_COLUMNS = new Set(['phone_number']);

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

/** insert/update 用 payload に電話を反映（phone_number のみ。phone/tel 列は本番に無い） */
export function applyPhoneToCustomerPayload(
  payload: Record<string, unknown>,
  raw: string | null | undefined
): void {
  const phoneNorm = normalizePhoneDigitsForDb(raw);
  if (!phoneNorm) return;
  payload.phone_number = phoneNorm;
}

