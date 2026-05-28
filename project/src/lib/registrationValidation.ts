import { supabase } from './supabase';

/** 金額欄は空欄不可。支払がなくても「0」の明示入力が必要 */
export function validateExplicitAmount(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '金額を入力してください。支払がない場合でも「0」と入力してください。';
  }
  const n = Number(trimmed);
  if (Number.isNaN(n)) {
    return '金額は数値で入力してください。支払がない場合は「0」と入力してください。';
  }
  return null;
}

export function formatCustomerNumberForMessage(customerNumber: string | null | undefined): string {
  const cn = String(customerNumber ?? '').trim();
  return cn || '（番号なし）';
}

export function splitAmountAcrossLines(total: number, lineCount: number): number[] {
  if (lineCount <= 0) return [];
  if (lineCount === 1) return [total];
  const base = Math.floor((total / lineCount) * 100) / 100;
  const amounts = Array<number>(lineCount).fill(base);
  const assigned = base * (lineCount - 1);
  amounts[lineCount - 1] = Math.round((total - assigned) * 100) / 100;
  return amounts;
}

export async function hasVisitOnDate(
  customerId: string,
  visitDate: string,
  excludeId?: string | null
): Promise<boolean> {
  let q = supabase
    .from('visit_records')
    .select('id')
    .eq('customer_id', customerId)
    .eq('visit_date', visitDate);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.limit(1).maybeSingle();
  return !!data;
}

export async function hasProductSaleOnDate(customerId: string, saleDate: string): Promise<boolean> {
  const { data } = await supabase
    .from('product_sales')
    .select('id')
    .eq('customer_id', customerId)
    .eq('sale_date', saleDate)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function hasSubscriptionOnDate(
  customerId: string,
  startDate: string,
  excludeId?: string | null
): Promise<boolean> {
  let q = supabase
    .from('subscription_records')
    .select('id')
    .eq('customer_id', customerId)
    .eq('start_date', startDate);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.limit(1).maybeSingle();
  return !!data;
}

export async function hasCustomerNumber(customerNumber: string, excludeId?: string): Promise<boolean> {
  const cn = customerNumber.trim();
  if (!cn) return false;
  let q = supabase.from('customers').select('id').eq('customer_number', cn);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.limit(1).maybeSingle();
  return !!data;
}
