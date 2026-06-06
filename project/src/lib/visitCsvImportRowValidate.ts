import type { Database } from './database.types';
import { looksLikeUuid } from './paymentDisplay';
import { parseLocalVisitDateToYmd } from './visitDateParse';
import { normalizeCellText, resolvePaymentMethodMasterIdForVisitImport } from './visitImportRules';
import { idx } from './visitCsvTemplate';

type VisitInsert = Database['public']['Tables']['visit_records']['Insert'];
type CustomerRow = Pick<
  Database['public']['Tables']['customers']['Row'],
  'id' | 'name' | 'customer_number'
>;

const kawanishiClinic = '川西あつ整体院';
const takatsukiClinic = '高槻あつ整体院';

const toDigits = (v: string) => v.replace(/\D/g, '');

export const customerNumberCandidates = (v: string): string[] => {
  const base = String(v ?? '')
    .normalize('NFKC')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim()
    .replace(/[, ]/g, '')
    .replace(/^'+/, '')
    .replace(/\.0+$/, '');
  const out = new Set<string>();
  const digits = toDigits(base);
  if (digits) {
    out.add(digits);
    const noZero = digits.replace(/^0+/, '');
    if (noZero) out.add(noZero);
  }
  if (/^\d+(\.\d+)?$/.test(base)) {
    const i = String(Math.trunc(Number(base)));
    if (Number.isFinite(Number(base)) && i !== 'NaN') {
      out.add(i);
      out.add(i.replace(/^0+/, '') || '0');
    }
  }
  if (base) out.add(base);
  return [...out].filter(Boolean);
};

const parseAmount = (raw: string): number | null => {
  const n = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
};

const pickClinicByCustomerNumber = (customerNumberDigits: string): string | null => {
  const num = Number(customerNumberDigits);
  if (!Number.isFinite(num)) return null;
  if (num <= 4999) return kawanishiClinic;
  return takatsukiClinic;
};

const parseTicketCell = (raw: string): { raw: string; points: number } => {
  const rawTrim = raw.trim();
  if (!rawTrim) return { raw: '', points: 0 };
  if (rawTrim.includes('/')) {
    const a = rawTrim.split('/')[0] || '';
    const p = Number(a.replace(/\D/g, ''));
    return { raw: rawTrim, points: Number.isFinite(p) ? p : 0 };
  }
  const p = Number(rawTrim.replace(/,/g, ''));
  return { raw: rawTrim, points: Number.isFinite(p) ? p : 0 };
};

const parseBeOptional = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t.replace(/,/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  return n;
};

export function padVisitCsvCells(row: string[]): string[] {
  const out = [...row];
  while (out.length < 11) out.push('');
  return out.slice(0, 11);
}

export type ValidatedVisitCsvRow = {
  customerId: string;
  visitDate: string;
  numberDigits: string;
  payMismatch: boolean;
  insert: Omit<VisitInsert, 'visit_number'>;
  cells: string[];
};

export type VisitCsvValidateContext = {
  customerMap: Map<string, CustomerRow>;
  customerById: Map<string, CustomerRow>;
  methods: { id: string; name: string | null }[];
  methodMasterError: boolean;
};

export function validateVisitCsvDataRow(
  row: string[],
  ctx: VisitCsvValidateContext
):
  | { ok: true; validated: ValidatedVisitCsvRow; infoMessages: string[] }
  | { ok: false; reason: string } {
  const cells = padVisitCsvCells(row);
  const infoMessages: string[] = [];

  const c2 = (cells[idx.customer] || '').trim();
  const visitDate = parseLocalVisitDateToYmd(cells[idx.date] || '');
  const amount = parseAmount(cells[idx.amount] || '');

  if (!visitDate) {
    return { ok: false, reason: '日付の形式が不正（1列目=日付）' };
  }
  if (amount == null) {
    return { ok: false, reason: '売上金額が不正（4列目=売上）' };
  }
  if (!c2) {
    return { ok: false, reason: '2列目（顧客：番号 or 顧客ID）が空' };
  }

  let customer: CustomerRow | undefined;
  if (looksLikeUuid(c2)) {
    customer = ctx.customerById.get(c2);
    if (!customer) {
      return { ok: false, reason: `2列目の顧客ID ${c2} は未登録` };
    }
  } else {
    const candidates = customerNumberCandidates(c2);
    if (!candidates.length) {
      return { ok: false, reason: '2列目の顧客番号が解釈できない' };
    }
    customer = candidates.map((k) => ctx.customerMap.get(k)).find(Boolean);
    if (!customer) {
      return { ok: false, reason: `顧客番号 ${c2} は未登録（先に顧客登録/インポート）` };
    }
  }

  const nameCell = (cells[idx.name] || '').trim();
  if (nameCell && customer.name && nameCell !== customer.name) {
    infoMessages.push(`氏名（CSV: ${nameCell} / 登録: ${customer.name}）→ CSV 値を import_customer_name に保存。`);
  }

  const rawMethod = normalizeCellText(cells[idx.paymentMethod] || '');
  const rawKind = (cells[idx.kind] || '').replace(/\u3000/g, ' ');

  const methodResolved =
    rawMethod && !ctx.methodMasterError
      ? resolvePaymentMethodMasterIdForVisitImport(cells[idx.paymentMethod] || '', ctx.methods)
      : null;
  const methodId: string | null = methodResolved?.id ?? null;
  const payMismatch = Boolean(rawMethod && !methodId);

  const importKindText = rawKind.replace(/\u3000/g, ' ').trim() || null;
  const menuCell = (cells[idx.menu] || '').trim();
  const importCsvVisitCount = (cells[idx.csvVisitCount] || '').trim() || null;
  const be = parseBeOptional(cells[idx.beCount] || '');
  const ticket = parseTicketCell(cells[idx.ticket] || '');
  const memo = (cells[idx.memo] || '').trim() || null;

  const numberDigits =
    customerNumberCandidates(c2)[0] || customerNumberCandidates(customer.customer_number || '5000')[0];
  const clinic = pickClinicByCustomerNumber(numberDigits);
  if (!clinic) {
    return { ok: false, reason: '顧客番号から院を判別できない。2列目/顧客の番号に数字を。' };
  }

  const insert: Omit<VisitInsert, 'visit_number'> = {
    customer_id: customer.id,
    visit_date: visitDate,
    amount,
    payment_method: methodId ?? null,
    payment_detail_id: null,
    import_kind_text: importKindText,
    menu_name: menuCell || null,
    points_used: ticket.points,
    import_customer_name: nameCell || null,
    import_csv_visit_count: importCsvVisitCount,
    import_ticket_count_raw: ticket.raw || null,
    be_equivalent_count: be,
    memo,
    clinic_name: clinic,
  };

  return {
    ok: true,
    validated: {
      customerId: customer.id,
      visitDate,
      numberDigits: numberDigits || c2,
      payMismatch,
      insert,
      cells,
    },
    infoMessages,
  };
}
