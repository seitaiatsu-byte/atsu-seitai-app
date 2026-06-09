/** 日本の祝日（振替休日・国民の休日を含む）— 稼働率の分母から除外用 */

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(year, month - 1, d);
    if (dt.getMonth() !== month - 1) break;
    if (dt.getDay() === weekday) {
      count++;
      if (count === n) return d;
    }
  }
  return 0;
}

function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function baseHolidaysForYear(year: number): Set<string> {
  const h = new Set<string>();
  const add = (m: number, d: number) => h.add(ymd(year, m, d));

  add(1, 1);
  const comingAge = nthWeekdayOfMonth(year, 1, 1, 2);
  if (comingAge) add(1, comingAge);
  add(2, 11);
  add(2, 23);
  add(3, vernalEquinoxDay(year));
  add(4, 29);
  add(5, 3);
  add(5, 4);
  add(5, 5);
  const marine = nthWeekdayOfMonth(year, 7, 1, 3);
  if (marine) add(7, marine);
  add(8, 11);
  const respect = nthWeekdayOfMonth(year, 9, 1, 3);
  if (respect) add(9, respect);
  add(9, autumnalEquinoxDay(year));
  const sports = nthWeekdayOfMonth(year, 10, 1, 2);
  if (sports) add(10, sports);
  add(11, 3);
  add(11, 23);

  return h;
}

function weekdayFromYmd(ymdStr: string): number {
  const [y, m, d] = ymdStr.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d).getDay();
}

function addDays(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function applySubstituteAndBridge(holidays: Set<string>, year: number): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const day of [...holidays].sort()) {
      if (!day.startsWith(`${year}-`)) continue;
      if (weekdayFromYmd(day) === 0) {
        let next = addDays(day, 1);
        while (holidays.has(next)) next = addDays(next, 1);
        if (!holidays.has(next)) {
          holidays.add(next);
          changed = true;
        }
      }
    }
    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(year, m, 0).getDate();
      for (let d = 1; d < daysInMonth; d++) {
        const cur = ymd(year, m, d);
        const next = ymd(year, m, d + 1);
        if (holidays.has(cur) || holidays.has(next)) continue;
        const prev = addDays(cur, -1);
        if (holidays.has(prev) && weekdayFromYmd(cur) !== 0) {
          holidays.add(cur);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

const cache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  if (cache.has(year)) return cache.get(year)!;
  const set = baseHolidaysForYear(year);
  applySubstituteAndBridge(set, year);
  cache.set(year, set);
  return set;
}

/** 国民の祝日（一般的なカレンダー準拠・振替休日込み） */
export function isJapanesePublicHoliday(ymdStr: string): boolean {
  const y = parseInt(ymdStr.slice(0, 4), 10);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return false;
  return holidaysForYear(y).has(ymdStr.slice(0, 10));
}
