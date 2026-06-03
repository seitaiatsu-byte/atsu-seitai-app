import { supabase } from './supabase';

export type WeekdayBusinessHour = {
  weekday: number;
  label: string;
  start_time: string;
  end_time: string;
  is_open: boolean;
};

export const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const DEFAULT_WEEKDAY_BUSINESS_HOURS: WeekdayBusinessHour[] = [
  { weekday: 0, label: '日曜', start_time: '10:00', end_time: '18:00', is_open: false },
  { weekday: 1, label: '月曜', start_time: '10:00', end_time: '20:00', is_open: true },
  { weekday: 2, label: '火曜', start_time: '10:00', end_time: '20:00', is_open: true },
  { weekday: 3, label: '水曜', start_time: '10:00', end_time: '20:00', is_open: true },
  { weekday: 4, label: '木曜', start_time: '10:00', end_time: '20:00', is_open: true },
  { weekday: 5, label: '金曜', start_time: '10:00', end_time: '20:00', is_open: true },
  { weekday: 6, label: '土曜', start_time: '10:00', end_time: '20:00', is_open: true },
];

function normalizeTime(t: string): string {
  const [h, m] = String(t || '0:0').split(':').map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = normalizeTime(t).split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export async function fetchWeekdayBusinessHours(): Promise<WeekdayBusinessHour[]> {
  const { data, error } = await supabase
    .from('weekday_business_hours')
    .select('weekday, label, start_time, end_time, is_open')
    .order('weekday', { ascending: true });

  if (error || !data?.length) {
    return DEFAULT_WEEKDAY_BUSINESS_HOURS;
  }

  const byDay = new Map<number, WeekdayBusinessHour>();
  for (const row of data) {
    const w = Number(row.weekday);
    if (w < 0 || w > 6) continue;
    byDay.set(w, {
      weekday: w,
      label: String(row.label || WEEKDAY_LABELS_JA[w]),
      start_time: normalizeTime(String(row.start_time)),
      end_time: normalizeTime(String(row.end_time)),
      is_open: Boolean(row.is_open),
    });
  }

  return DEFAULT_WEEKDAY_BUSINESS_HOURS.map((d) => byDay.get(d.weekday) ?? d);
}

export async function saveWeekdayBusinessHours(rows: WeekdayBusinessHour[]): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const row of rows) {
    if (row.is_open && timeToMinutes(row.end_time) <= timeToMinutes(row.start_time)) {
      return { ok: false, message: `${row.label}は終了時間を開始より後にしてください` };
    }
  }

  const payload = rows.map((row) => ({
    weekday: row.weekday,
    label: row.label,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    is_open: row.is_open,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('weekday_business_hours').upsert(payload, { onConflict: 'weekday' });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** 指定日の営業枠（分）。休業日・未設定は null */
export function businessBoundsForDate(
  dateYmd: string,
  schedule: WeekdayBusinessHour[]
): { startM: number; endM: number } | null {
  const d = new Date(`${dateYmd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const row = schedule.find((r) => r.weekday === d.getDay());
  if (!row?.is_open) return null;
  const startM = timeToMinutes(row.start_time);
  const endM = timeToMinutes(row.end_time);
  if (endM <= startM) return null;
  return { startM, endM };
}
