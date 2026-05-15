import { supabase } from './supabase';

export type ChiefComplaintMasterRow = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at?: string;
};

async function loadTable(
  table: 'chief_complaint_master' | 'main_complaint_master',
  activeOnly: boolean
): Promise<ChiefComplaintMasterRow[]> {
  let q = supabase.from(table).select('*').order('display_order', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) {
    const fallback = await supabase.from(table).select('*').order('display_order', { ascending: true });
    return (fallback.data || []) as ChiefComplaintMasterRow[];
  }
  return (data || []) as ChiefComplaintMasterRow[];
}

/**
 * 主訴マスタを取得。設定画面は chief_complaint_master、旧環境は main_complaint_master も併用。
 */
export async function loadChiefComplaintMaster(activeOnly = true): Promise<ChiefComplaintMasterRow[]> {
  const [chief, main] = await Promise.all([
    loadTable('chief_complaint_master', activeOnly),
    loadTable('main_complaint_master', activeOnly),
  ]);

  const byName = new Map<string, ChiefComplaintMasterRow>();
  for (const row of [...main, ...chief]) {
    const name = String(row.name ?? '').trim();
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing || (row.display_order ?? 0) < (existing.display_order ?? 0)) {
      byName.set(name, { ...row, name });
    }
  }

  return [...byName.values()].sort(
    (a, b) => (a.display_order - b.display_order) || a.name.localeCompare(b.name, 'ja')
  );
}
