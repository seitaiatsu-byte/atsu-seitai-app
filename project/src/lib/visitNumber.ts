import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { toErrorMessage } from './toErrorMessage';

/** 顧客 ID ごとの最大 visit_number（DB 上。未登録は 0 相当） */
export async function fetchMaxVisitNumberByCustomer(
  supabase: SupabaseClient<Database>,
  customerIds: string[]
): Promise<
  { ok: true; map: Map<string, number> } | { ok: false; message: string }
> {
  const out = new Map<string, number>();
  const unique = [...new Set(customerIds)].filter(Boolean);
  if (unique.length === 0) return { ok: true, map: out };
  const { data, error } = await supabase
    .from('visit_records')
    .select('customer_id, visit_number')
    .in('customer_id', unique);
  if (error) return { ok: false, message: toErrorMessage(error) };
  for (const row of data || []) {
    const vn = row.visit_number;
    if (vn == null) continue;
    const cur = out.get(row.customer_id) ?? 0;
    if (vn > cur) out.set(row.customer_id, vn);
  }
  return { ok: true, map: out };
}

/**
 * 同一顧客で複数行のインポート時: 日付・出現順で整列し、採番を割り当て
 */
export function assignVisitNumbersInBatch(
  maxFromDb: Map<string, number>,
  items: { customerId: string; visitDate: string; orderKey: number }[]
): number[] {
  const running = new Map<string, number>(maxFromDb);
  const ordered = items
    .map((it, i) => ({ ...it, i }))
    .sort(
      (a, b) =>
        a.customerId.localeCompare(b.customerId) ||
        a.visitDate.localeCompare(b.visitDate) ||
        a.orderKey - b.orderKey
    );
  const byOriginalIndex: number[] = new Array(items.length);
  for (const it of ordered) {
    const c = it.customerId;
    const was = running.get(c) ?? 0;
    const next = was + 1;
    running.set(c, next);
    byOriginalIndex[it.i] = next;
  }
  return byOriginalIndex;
}
