import { useCallback, useEffect, useState } from 'react';

export const VISIT_COLUMN_STORAGE_KEY = 'clinic-visit-display-cols-v1';

export type VisitDisplayColumnId =
  | 'date'
  | 'visit_number'
  | 'customer_number'
  | 'name'
  | 'amount'
  | 'payment_method'
  | 'payment_detail'
  | 'menu'
  | 'csv_visit_count'
  | 'be_count'
  | 'ticket'
  | 'memo'
  | 'program'
  | 'staff';

export const VISIT_COLUMN_DEFS: { id: VisitDisplayColumnId; label: string; hint?: string }[] = [
  { id: 'date', label: '日付' },
  { id: 'visit_number', label: '当院通算 通院', hint: 'DB の visit_number' },
  { id: 'customer_number', label: '顧客番号' },
  { id: 'name', label: '氏名' },
  { id: 'amount', label: '売上金額' },
  { id: 'payment_method', label: '支払方法' },
  { id: 'payment_detail', label: '種類' },
  { id: 'menu', label: 'メニュー' },
  { id: 'csv_visit_count', label: '通院count(表の値)' },
  { id: 'be_count', label: '実質BE回数' },
  { id: 'ticket', label: '回数券' },
  { id: 'memo', label: 'メモ' },
  { id: 'program', label: 'プログラム' },
  { id: 'staff', label: '担当' },
];

const DEFAULTS: Record<VisitDisplayColumnId, boolean> = {
  date: true,
  visit_number: true,
  customer_number: true,
  name: true,
  amount: true,
  payment_method: true,
  payment_detail: true,
  menu: true,
  csv_visit_count: true,
  be_count: true,
  ticket: true,
  memo: true,
  program: false,
  staff: false,
};

function readPrefs(): Record<VisitDisplayColumnId, boolean> {
  try {
    const raw = localStorage.getItem(VISIT_COLUMN_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...DEFAULTS, ...parsed } as Record<VisitDisplayColumnId, boolean>;
  } catch {
    return { ...DEFAULTS };
  }
}

export function isVisitColumnOn(id: VisitDisplayColumnId): boolean {
  return readPrefs()[id] !== false;
}

export function setVisitColumnPref(id: VisitDisplayColumnId, on: boolean) {
  const p = readPrefs();
  p[id] = on;
  localStorage.setItem(VISIT_COLUMN_STORAGE_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event('visit-column-prefs-updated'));
}

export function useVisitColumnPrefs() {
  const [prefs, setPrefs] = useState<Record<VisitDisplayColumnId, boolean>>(() => readPrefs());
  const refresh = useCallback(() => {
    setPrefs(readPrefs());
  }, []);

  useEffect(() => {
    const h = () => refresh();
    window.addEventListener('storage', h);
    window.addEventListener('visit-column-prefs-updated', h);
    return () => {
      window.removeEventListener('storage', h);
      window.removeEventListener('visit-column-prefs-updated', h);
    };
  }, [refresh]);

  const setOne = useCallback((id: VisitDisplayColumnId, on: boolean) => {
    setVisitColumnPref(id, on);
    setPrefs(readPrefs());
  }, []);

  return { prefs, setOne, defs: VISIT_COLUMN_DEFS };
}
