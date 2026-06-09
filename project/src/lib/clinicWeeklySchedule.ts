import { supabase } from './supabase';
import { isJapanesePublicHoliday } from './japaneseHolidays';
import { parseMenuSlotRules, type MenuSlotRule } from './menuSlotRules';

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};

export type ClinicDaySlots = Record<WeekdayKey, number>;

export type UtilizationScheduleConfig = {
  takatsuki: ClinicDaySlots;
  kawanishi: ClinicDaySlots;
  excludeHolidays: boolean;
  /** 週別未設定時のフォールバック（全日一律） */
  legacyDailyMaxSlots: number;
  /** メニュー名キーワードごとの消費枠 */
  menuSlotRules: MenuSlotRule[];
  defaultMenuSlotWeight: number;
};

/** 高槻の例: 月・水・金＋土午前 */
export const DEFAULT_TAKATSUKI_SCHEDULE: ClinicDaySlots = {
  mon: 4,
  tue: 0,
  wed: 4,
  thu: 0,
  fri: 4,
  sat: 2,
  sun: 0,
};

export const DEFAULT_KAWANISHI_SCHEDULE: ClinicDaySlots = {
  mon: 0,
  tue: 0,
  wed: 0,
  thu: 0,
  fri: 0,
  sat: 0,
  sun: 0,
};

export function emptyClinicDaySlots(): ClinicDaySlots {
  return { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
}

export function scheduleFromLegacyDailyMax(slots: number): ClinicDaySlots {
  const n = Math.max(0, slots);
  return { mon: n, tue: n, wed: n, thu: n, fri: n, sat: n, sun: 0 };
}

export function parseClinicDaySlots(raw: string | undefined, fallback: ClinicDaySlots): ClinicDaySlots {
  if (!raw?.trim()) return { ...fallback };
  try {
    const obj = JSON.parse(raw) as Partial<Record<WeekdayKey, unknown>>;
    const out = emptyClinicDaySlots();
    for (const key of WEEKDAY_KEYS) {
      const v = parseInt(String(obj[key] ?? ''), 10);
      out[key] = Number.isFinite(v) && v >= 0 ? v : 0;
    }
    return out;
  } catch {
    return { ...fallback };
  }
}

export function serializeClinicDaySlots(slots: ClinicDaySlots): string {
  const out: Record<WeekdayKey, number> = emptyClinicDaySlots();
  for (const key of WEEKDAY_KEYS) {
    out[key] = Math.max(0, Math.floor(slots[key] || 0));
  }
  return JSON.stringify(out);
}

export function ymdToWeekdayKey(ymdStr: string): WeekdayKey {
  const [y, m, d] = ymdStr.split('-').map((x) => parseInt(x, 10));
  const jsDay = new Date(y, m - 1, d).getDay();
  const map: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[jsDay] ?? 'mon';
}

function addDaysYmd(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function dayCapacity(
  ymdStr: string,
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi',
  schedule: UtilizationScheduleConfig,
  useWeekly: boolean
): number {
  if (schedule.excludeHolidays && isJapanesePublicHoliday(ymdStr)) return 0;

  const weekday = ymdToWeekdayKey(ymdStr);
  if (!useWeekly) {
    if (weekday === 'sun') return 0;
    const n = schedule.legacyDailyMaxSlots;
    if (clinicFilter === 'all') return n * 2;
    return n;
  }

  let cap = 0;
  if (clinicFilter === 'all' || clinicFilter === 'takatsuki') {
    cap += schedule.takatsuki[weekday] || 0;
  }
  if (clinicFilter === 'all' || clinicFilter === 'kawanishi') {
    cap += schedule.kawanishi[weekday] || 0;
  }
  return cap;
}

export function computeCapacityForPeriod(params: {
  startYmd: string;
  endYmd: string;
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi';
  schedule: UtilizationScheduleConfig;
  useWeeklySchedule?: boolean;
}): { maxSlots: number; operatingDays: number; calendarDays: number } {
  const { startYmd, endYmd, clinicFilter, schedule, useWeeklySchedule = true } = params;
  let maxSlots = 0;
  let operatingDays = 0;
  let calendarDays = 0;
  let cur = startYmd;
  while (cur <= endYmd) {
    calendarDays++;
    const cap = dayCapacity(cur, clinicFilter, schedule, useWeeklySchedule);
    if (cap > 0) {
      operatingDays++;
      maxSlots += cap;
    }
    cur = addDaysYmd(cur, 1);
  }
  return { maxSlots, operatingDays, calendarDays };
}

export async function fetchUtilizationSchedule(): Promise<UtilizationScheduleConfig> {
  const { data, error } = await supabase
    .from('business_rules')
    .select('rule_key, rule_value')
    .in('rule_key', [
      'daily_max_slots',
      'util_weekly_schedule_takatsuki',
      'util_weekly_schedule_kawanishi',
      'util_exclude_holidays',
      'util_menu_slot_rules',
      'util_default_menu_slot',
    ]);

  const legacyDaily = 20;
  const defaultMenuSlot = 1;
  if (error || !data?.length) {
    return {
      takatsuki: { ...DEFAULT_TAKATSUKI_SCHEDULE },
      kawanishi: { ...DEFAULT_KAWANISHI_SCHEDULE },
      excludeHolidays: true,
      legacyDailyMaxSlots: legacyDaily,
      menuSlotRules: [],
      defaultMenuSlotWeight: defaultMenuSlot,
    };
  }

  const map = Object.fromEntries(data.map((r) => [r.rule_key, r.rule_value]));
  const legacyParsed = parseInt(map.daily_max_slots || '20', 10);
  const legacyDailyMaxSlots =
    Number.isFinite(legacyParsed) && legacyParsed > 0 ? legacyParsed : legacyDaily;

  const hasWeekly =
    Boolean(map.util_weekly_schedule_takatsuki?.trim()) ||
    Boolean(map.util_weekly_schedule_kawanishi?.trim());

  const defaultSlotParsed = parseFloat(map.util_default_menu_slot || '1');
  const defaultMenuSlotWeight =
    Number.isFinite(defaultSlotParsed) && defaultSlotParsed > 0 ? defaultSlotParsed : defaultMenuSlot;

  return {
    takatsuki: parseClinicDaySlots(
      map.util_weekly_schedule_takatsuki,
      hasWeekly ? DEFAULT_TAKATSUKI_SCHEDULE : scheduleFromLegacyDailyMax(legacyDailyMaxSlots)
    ),
    kawanishi: parseClinicDaySlots(
      map.util_weekly_schedule_kawanishi,
      hasWeekly ? DEFAULT_KAWANISHI_SCHEDULE : scheduleFromLegacyDailyMax(legacyDailyMaxSlots)
    ),
    excludeHolidays: map.util_exclude_holidays !== '0',
    legacyDailyMaxSlots,
    menuSlotRules: parseMenuSlotRules(map.util_menu_slot_rules || ''),
    defaultMenuSlotWeight,
  };
}

export function hasWeeklyScheduleConfigured(schedule: UtilizationScheduleConfig): boolean {
  const sum = (s: ClinicDaySlots) => WEEKDAY_KEYS.reduce((a, k) => a + (s[k] || 0), 0);
  return sum(schedule.takatsuki) > 0 || sum(schedule.kawanishi) > 0;
}
