import type { Database } from './database.types';
import { clinicNameToShortLabel } from './clinic';
import { formatPaymentDetailLabel, formatPaymentMethodLabel } from './paymentDisplay';
import { formatVisitDateJa } from './visitDateParse';

export type VisitRow = Database['public']['Tables']['visit_records']['Row'];

type CustomerLite = { customer_number: string | null; name: string };

type Joined = VisitRow & { customers?: { name?: string; customer_number?: string | null } | null };

export function groupVisitsByDate(visits: VisitRow[]): Map<string, VisitRow[]> {
  const m = new Map<string, VisitRow[]>();
  for (const v of visits) {
    const key = (v.visit_date || '').slice(0, 10) || '—';
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(v);
  }
  for (const list of m.values()) {
    list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }
  return m;
}

/** 1来院レコード分の表示用行（11列+システム項目） */
export function getVisitFieldRows(
  v: Joined,
  ctx: {
    customer: CustomerLite | null;
    methodIdToName: Record<string, string>;
    detailIdToName: Record<string, string>;
  }
): { key: string; label: string; value: string }[] {
  const name =
    (v.import_customer_name?.trim() || v.customers?.name || ctx.customer?.name || '—').trim() || '—';
  const custNo =
    (v.customers?.customer_number ?? ctx.customer?.customer_number)?.trim() || '—';
  const ticket =
    (v.import_ticket_count_raw?.trim() ||
      (v.points_used != null && v.points_used !== 0 ? String(v.points_used) : '')) ||
    '—';
  const pm = formatPaymentMethodLabel(v.payment_method, ctx.methodIdToName);
  const pd = formatPaymentDetailLabel(v.payment_detail_id, ctx.detailIdToName, v.import_kind_text, v.memo);

  const rows: { key: string; label: string; value: string }[] = [
    { key: 'd', label: '日付', value: v.visit_date ? formatVisitDateJa(v.visit_date) : '—' },
    {
      key: 'vn',
      label: '当院通算',
      value: v.visit_number != null ? `第${v.visit_number}回` : '—',
    },
    { key: 'cn', label: '顧客番号', value: custNo },
    { key: 'nm', label: '氏名', value: name },
    { key: 'am', label: '売上金額', value: `¥${Number(v.amount ?? 0).toLocaleString()}` },
    { key: 'pmm', label: '支払方法', value: pm },
    { key: 'pdd', label: '種類', value: pd },
    { key: 'mn', label: '実施メニュー', value: (v.menu_name || '—').trim() || '—' },
    { key: 'csv', label: '通院count(表の値)', value: v.import_csv_visit_count?.trim() || '—' },
    {
      key: 'be',
      label: '実質BE回数',
      value: v.be_equivalent_count == null ? '—' : String(v.be_equivalent_count),
    },
    { key: 'tk', label: '回数券', value: ticket },
    { key: 'mm', label: 'メモ', value: (v.memo || '—').trim() || '—' },
    { key: 'st', label: '担当', value: (v.staff_name || '—').trim() || '—' },
    { key: 'cl', label: '院', value: clinicNameToShortLabel(v.clinic_name) },
    {
      key: 'mc',
      label: '維持費',
      value: v.maintenance_cost != null && v.maintenance_cost !== 0 ? `¥${Number(v.maintenance_cost).toLocaleString()}` : '—',
    },
  ];
  return rows;
}
