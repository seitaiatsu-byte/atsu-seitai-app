import { normalizePhoneDigitsForDb } from './customerImportHelpers';

const PHONE_READ_KEYS = ['phone_number', 'phone', 'mobile', 'tel', 'TEL', 'phoneNumber'] as const;

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

/**
 * insert/update 用 payload に電話を反映。
 * phone_number に加え phone 別名列にも書く（環境差で片方だけ存在する場合の救済）。
 */
export function applyPhoneToCustomerPayload(
  payload: Record<string, unknown>,
  raw: string | null | undefined
): void {
  const phoneNorm = normalizePhoneDigitsForDb(raw);
  payload.phone_number = phoneNorm;
  if (phoneNorm) payload.phone = phoneNorm;
}

