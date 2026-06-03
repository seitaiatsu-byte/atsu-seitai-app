import { supabase } from './supabase';

export type BreakPeriod = {
  start_time: string;
  end_time: string;
};

export type WeekdayBusinessHour = {
  weekday: number;
  label: string;
  start_time: string;
  end_time: string;
  is_open: boolean;
  breaks: BreakPeriod[];
};

export const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const DEFAULT_WEEKDAY_BUSINESS_HOURS: WeekdayBusinessHour[] = [
  { weekday: 0, label: '日曜', start_time: '10:00', end_time: '18:00', is_open: false, breaks: [] },
  { weekday: 1, label: '月曜', start_time: '10:00', end_time: '20:00', is_open: true, breaks: [] },
  { weekday: 2, label: '火曜', start_time: '10:00', end_time: '20:00', is_open: true, breaks: [] },
  { weekday: 3, label: '水曜', start_time: '10:00', end_time: '20:00', is_open: true, breaks: [] },
  { weekday: 4, label: '木曜', start_time: '10:00', end_time: '20:00', is_open: true, breaks: [] },
  { weekday: 5, label: '金曜', start_time: '10:00', end_time: '20:00', is_open: true, breaks: [] },
  { weekday: 6, label: '土曜', start_time: '10:00', end_time: '20:00', is_open: true, breaks: [] },
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

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseBreakPeriods(raw: unknown): BreakPeriod[] {
  if (!Array.isArray(raw)) return [];
  const list: BreakPeriod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const start_time = normalizeTime(String((item as BreakPeriod).start_time || ''));
    const end_time = normalizeTime(String((item as BreakPeriod).end_time || ''));
    if (!start_time || !end_time) continue;
    list.push({ start_time, end_time });
  }
  return list.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

function validateBreaks(row: WeekdayBusinessHour): string | null {
  if (!row.is_open) return null;
  const openStart = timeToMinutes(row.start_time);
  const openEnd = timeToMinutes(row.end_time);
  if (openEnd <= openStart) return `${row.label}は終了時間を開始より後にしてください`;

  const breaks = row.breaks || [];
  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i];
    const s = timeToMinutes(b.start_time);
    const e = timeToMinutes(b.end_time);
    if (e <= s) return `${row.label}の休憩${i + 1}は終了を開始より後にしてください`;
    if (s < openStart || e > openEnd) {
      return `${row.label}の休憩${i + 1}は営業時間（${row.start_time}〜${row.end_time}）の内側にしてください`;
    }
    if (i > 0) {
      const prevEnd = timeToMinutes(breaks[i - 1].end_time);
      if (s < prevEnd) return `${row.label}の休憩時間が重なっています`;
    }
  }
  return null;
}

export async function fetchWeekdayBusinessHours(): Promise<WeekdayBusinessHour[]> {
  const { data, error } = await supabase
    .from('weekday_business_hours')
    .select('weekday, label, start_time, end_time, is_open, break_periods')
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
      breaks: parseBreakPeriods(row.break_periods),
    });
  }

  return DEFAULT_WEEKDAY_BUSINESS_HOURS.map((d) => byDay.get(d.weekday) ?? d);
}

export async function saveWeekdayBusinessHours(rows: WeekdayBusinessHour[]): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const row of rows) {
    const err = validateBreaks(row);
    if (err) return { ok: false, message: err };
  }

  const payload = rows.map((row) => ({
    weekday: row.weekday,
    label: row.label,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    is_open: row.is_open,
    break_periods: (row.is_open ? row.breaks : []).map((b) => ({
      start_time: normalizeTime(b.start_time),
      end_time: normalizeTime(b.end_time),
    })),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('weekday_business_hours').upsert(payload, { onConflict: 'weekday' });
  if (error) {
    const msg = error.message || '';
    if (/weekday_business_hours|break_periods|schema cache/i.test(msg)) {
      return {
        ok: false,
        message:
          '曜日営業時間用のテーブル／休憩欄が Supabase にまだありません。\n' +
          'SQL Editor で次を順に実行してください:\n' +
          '・20260604100000_weekday_business_hours.sql\n' +
          '・20260605100000_weekday_business_break_periods.sql',
      };
    }
    return { ok: false, message: msg };
  }
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

/** 指定日の休憩枠（営業日のみ・営業時間内にクリップ） */
export function breaksForDate(dateYmd: string, schedule: WeekdayBusinessHour[]): BreakPeriod[] {
  const bounds = businessBoundsForDate(dateYmd, schedule);
  if (!bounds) return [];
  const d = new Date(`${dateYmd.slice(0, 10)}T12:00:00`);
  const row = schedule.find((r) => r.weekday === d.getDay());
  if (!row?.is_open) return [];

  return (row.breaks || [])
    .map((b) => {
      const s = Math.max(bounds.startM, timeToMinutes(b.start_time));
      const e = Math.min(bounds.endM, timeToMinutes(b.end_time));
      if (e <= s) return null;
      return { start_time: minutesToTime(s), end_time: minutesToTime(e) };
    })
    .filter((b): b is BreakPeriod => b !== null);
}
