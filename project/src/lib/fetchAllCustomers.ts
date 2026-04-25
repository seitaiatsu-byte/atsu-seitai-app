import { supabase } from './supabase';
import type { Database } from './database.types';

export type CustomerRow = Database['public']['Tables']['customers']['Row'];

/** PostgREST の max_rows を超えないよう 1 リクエストの件数（range は使わない） */
const CHUNK_SIZE = 500;

/** customers テーブルの行数（RLS 適用後の DB 上の件数）。一覧の取得件数と独立。 */
export async function fetchCustomerCountExact(): Promise<number | null> {
  const { count, error } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  if (error) {
    console.error('顧客件数カウントエラー:', error);
    return null;
  }
  return count ?? 0;
}

/**
 * offset の .range() は max_rows と組み合わさると取りこぼしやすいため、
 * 主キー id のキーセットページングで全行を取得する（各リクエストは id 昇順 + limit のみ）。
 * 表示用に created_at 降順へ並べ替え。
 */
export async function fetchAllCustomersByCreatedDesc(): Promise<CustomerRow[]> {
  const rows: CustomerRow[] = [];
  let lastId: string | null = null;

  for (;;) {
    // NULL の列も含め行単位で返す。PostgREST の行フィルタ（is null 等）は使わない。
    let q = supabase.from('customers').select('*').order('id', { ascending: true }).limit(CHUNK_SIZE);
    if (lastId !== null) {
      q = q.gt('id', lastId);
    }
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data || []) as CustomerRow[];
    if (batch.length === 0) break;
    rows.push(...batch);
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < CHUNK_SIZE) break;
  }

  rows.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return rows;
}

/** 自動採番用: customer_number のみ全件（id キーセット + limit） */
export async function fetchAllCustomerNumbers(): Promise<string[]> {
  const out: string[] = [];
  let lastId: string | null = null;

  for (;;) {
    let q = supabase
      .from('customers')
      .select('id, customer_number')
      .order('id', { ascending: true })
      .limit(CHUNK_SIZE);
    if (lastId !== null) {
      q = q.gt('id', lastId);
    }
    const { data, error } = await q;
    if (error) throw error;
    const batch = data || [];
    if (batch.length === 0) break;
    for (const r of batch) {
      if (r.customer_number != null && r.customer_number !== '') out.push(r.customer_number);
    }
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < CHUNK_SIZE) break;
  }

  return out;
}
