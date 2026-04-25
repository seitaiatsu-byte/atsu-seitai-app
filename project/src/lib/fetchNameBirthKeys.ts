import { supabase } from './supabase';

const CHUNK_SIZE = 500;

/**
 * 既存顧客の (氏名 + 生年月日) キー（両方ある行のみ）。重複判定用。形式: `${trim(name)}\t${YYYY-MM-DD}`
 */
export async function fetchExistingCustomerNameBirthKeySet(): Promise<Set<string>> {
  const set = new Set<string>();
  let lastId: string | null = null;

  for (;;) {
    let q = supabase
      .from('customers')
      .select('id, name, birth_date')
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
      const n = r.name?.trim();
      const b = r.birth_date;
      if (n && b) {
        set.add(`${n}\t${b}`);
      }
    }
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < CHUNK_SIZE) break;
  }

  return set;
}
