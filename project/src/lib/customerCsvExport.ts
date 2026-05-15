import type { CustomerRow } from './fetchAllCustomers';

export const CUSTOMER_ROSTER_CSV_HEADERS = [
  'customer_number',
  'name',
  'name_kana',
  'gender',
  'birth_date',
  'phone_number',
  'referral_source',
  'prefecture',
  'city',
  'town',
  'chief_complaint_1',
  'chief_complaint_2',
  'chief_complaint_3',
  'email',
  'memo',
] as const;

export function escapeCsvCell(v: string | null | undefined): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cellFromCustomer(c: CustomerRow, key: (typeof CUSTOMER_ROSTER_CSV_HEADERS)[number]): string {
  const r = c as CustomerRow & Record<string, unknown>;
  switch (key) {
    case 'customer_number':
      return String(c.customer_number ?? '');
    case 'name':
      return String(c.name ?? '');
    case 'name_kana':
      return String(c.name_kana ?? r.kana ?? '');
    case 'gender':
      return String(c.gender ?? '');
    case 'birth_date':
      return String(c.birth_date ?? r.birthday ?? '');
    case 'phone_number':
      return String(c.phone_number ?? '');
    case 'referral_source':
      return String(c.referral_source ?? r.main_source ?? '');
    case 'prefecture':
      return String(c.prefecture ?? '');
    case 'city':
      return String(c.city ?? '');
    case 'town':
      return String(c.town ?? '');
    case 'chief_complaint_1':
      return String(c.chief_complaint_1 ?? r.complaint_1 ?? r.chief_complaint ?? '');
    case 'chief_complaint_2':
      return String(c.chief_complaint_2 ?? r.complaint_2 ?? '');
    case 'chief_complaint_3':
      return String(c.chief_complaint_3 ?? r.complaint_3 ?? '');
    case 'email':
      return String(c.email ?? '');
    case 'memo':
      return String(c.memo ?? '');
    default:
      return '';
  }
}

export function customersToCsv(customers: CustomerRow[]): string {
  const lines = [CUSTOMER_ROSTER_CSV_HEADERS.join(',')];
  for (const c of customers) {
    lines.push(CUSTOMER_ROSTER_CSV_HEADERS.map((h) => escapeCsvCell(cellFromCustomer(c, h))).join(','));
  }
  return lines.join('\n');
}

export function downloadCustomersCsv(customers: CustomerRow[], filename: string): void {
  const blob = new Blob(['\ufeff' + customersToCsv(customers)], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
