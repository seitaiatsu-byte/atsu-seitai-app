export const CLINIC_FULL = {
  takatsuki: '高槻あつ整体院',
  kawanishi: '川西あつ整体院',
} as const;

/** アプリ上の表示名（色付き。DBには CLINIC_FULL のまま格納可能） */
export const CLINIC_SHORT_LABEL = {
  takatsuki: '高槻院',
  kawanishi: '川西',
} as const;

export type ClinicFullName = (typeof CLINIC_FULL)[keyof typeof CLINIC_FULL];

export const CLINIC_OPTIONS: { value: ClinicFullName; label: string; short: string; color: 'blue' | 'orange' }[] = [
  { value: CLINIC_FULL.takatsuki, label: CLINIC_SHORT_LABEL.takatsuki, short: CLINIC_SHORT_LABEL.takatsuki, color: 'blue' },
  { value: CLINIC_FULL.kawanishi, label: CLINIC_SHORT_LABEL.kawanishi, short: CLINIC_SHORT_LABEL.kawanishi, color: 'orange' },
];

/** プレーンテキスト用。不明・その他の院名は先頭20文字程度で返す。 */
export function clinicNameToShortLabel(clinic: string | null | undefined): string {
  const v = (clinic || '').trim();
  if (!v) return '—';
  if (v.includes('高槻')) return CLINIC_SHORT_LABEL.takatsuki;
  if (v.includes('川西')) return CLINIC_SHORT_LABEL.kawanishi;
  return v;
}

export function clinicMatchesRecord(
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi',
  recordClinic: string | null | undefined
): boolean {
  if (clinicFilter === 'all') return true;
  const v = recordClinic || '';
  if (clinicFilter === 'takatsuki') {
    return v.includes('高槻');
  }
  return v.includes('川西');
}

export function customerMatchesClinic(
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi',
  customerClinic: string | null | undefined
): boolean {
  if (clinicFilter === 'all') return true;
  const v = customerClinic || '';
  if (clinicFilter === 'takatsuki') return v.includes('高槻');
  return v.includes('川西');
}

/** 顧客番号（数字）から院名。未設定・解析不能なら null。 */
export function resolveClinicNameByCustomerNumber(
  customerNumber: string | null | undefined
): ClinicFullName | null {
  if (customerNumber == null || String(customerNumber).trim() === '') return null;
  const num = parseInt(String(customerNumber).trim(), 10);
  if (Number.isNaN(num)) return null;
  if (num >= 1 && num <= 4999) return CLINIC_FULL.kawanishi;
  if (num >= 5000) return CLINIC_FULL.takatsuki;
  return null;
}
