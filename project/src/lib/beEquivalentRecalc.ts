import { supabase } from './supabase';
import { parseLocalVisitDateToYmd } from './visitDateParse';

type VisitLite = {
  id: string;
  customer_id: string;
  visit_date: string;
  created_at?: string | null;
};

function sortVisitsByTimeline(a: VisitLite, b: VisitLite): number {
  const ad = parseLocalVisitDateToYmd(String(a.visit_date ?? '')) || String(a.visit_date ?? '');
  const bd = parseLocalVisitDateToYmd(String(b.visit_date ?? '')) || String(b.visit_date ?? '');
  if (ad !== bd) return ad.localeCompare(bd);
  const ac = String(a.created_at ?? '');
  const bc = String(b.created_at ?? '');
  if (ac !== bc) return ac.localeCompare(bc);
  return a.id.localeCompare(b.id);
}

/**
 * 顧客ごとの来院を日付順に並べ、be_equivalent_count を 1..N で振り直す。
 * さかのぼり投入・修正・削除後に呼ぶと、Excelの通し回数に近い挙動になる。
 */
export async function recalcBeEquivalentCountsForCustomers(customerIds: string[]): Promise<void> {
  const uniq = Array.from(new Set(customerIds.filter(Boolean)));
  if (!uniq.length) return;

  const { data, error } = await supabase
    .from('visit_records')
    .select('id, customer_id, visit_date, created_at')
    .in('customer_id', uniq);
  if (error || !data) return;

  const byCustomer = new Map<string, VisitLite[]>();
  for (const row of data as VisitLite[]) {
    if (!byCustomer.has(row.customer_id)) byCustomer.set(row.customer_id, []);
    byCustomer.get(row.customer_id)!.push(row);
  }

  for (const [, rows] of byCustomer) {
    rows.sort(sortVisitsByTimeline);
    for (let i = 0; i < rows.length; i++) {
      const next = i + 1;
      await supabase.from('visit_records').update({ be_equivalent_count: next }).eq('id', rows[i]!.id);
    }
  }
}

