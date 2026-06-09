import { clinicMatchesRecord } from './clinic';
import {
  computeCapacityForPeriod,
  hasWeeklyScheduleConfigured,
  type UtilizationScheduleConfig,
} from './clinicWeeklySchedule';
import { totalWeightedSlotsUsed } from './menuSlotRules';
import { filterQualifyingVisits, type VisitLite } from './repeatMetrics';

export type UtilizationVisitRow = VisitLite & {
  clinic_name?: string | null;
};

export type UtilizationBand = {
  id: string;
  minInclusive: number;
  maxExclusive: number | null;
  label: string;
  action: string;
};

/** 経営判断の目安（UI の折りたたみガイド用） */
export const UTILIZATION_GUIDANCE: UtilizationBand[] = [
  {
    id: 'acquire',
    minInclusive: 0,
    maxExclusive: 50,
    label: '〜50%',
    action: '集客強化フェーズ。値上げ・増員は早い。広告・紹介施策を優先。',
  },
  {
    id: 'stable',
    minInclusive: 50,
    maxExclusive: 70,
    label: '50〜70%',
    action: '安定ゾーン。メニュー改善・単価（物販・回数券）の土台作り。',
  },
  {
    id: 'price_review',
    minInclusive: 70,
    maxExclusive: 85,
    label: '70〜85%',
    action: '値上げ検討ゾーン。待ち時間・予約取りづらさが出始めたら価格より先にキャパ確認。',
  },
  {
    id: 'expand',
    minInclusive: 85,
    maxExclusive: 92,
    label: '85〜92%',
    action: '増員・枠拡大ゾーン。スタッフ追加、営業日延長、予約枠の見直し。',
  },
  {
    id: 'capacity',
    minInclusive: 92,
    maxExclusive: null,
    label: '92%超（数ヶ月続く）',
    action: 'キャパ不足。値上げだけだと離患リスク。品質・待ち時間も監視。',
  },
];

export function utilizationBandForRate(rate: number): UtilizationBand {
  for (const band of UTILIZATION_GUIDANCE) {
    if (band.maxExclusive === null) {
      if (rate >= band.minInclusive) return band;
    } else if (rate >= band.minInclusive && rate < band.maxExclusive) {
      return band;
    }
  }
  return UTILIZATION_GUIDANCE[0];
}

export type UtilizationResult = {
  label: string;
  startYmd: string;
  endYmd: string;
  slotsUsed: number;
  maxSlots: number;
  utilizationRate: number;
  calendarDays: number;
  operatingDays: number;
  lowSample: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export function ymdOnly(raw: string): string {
  return String(raw).slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function daysBetweenInclusive(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff + 1);
}

export function ymToRange(ym: string): { startYmd: string; endYmd: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) {
    const now = new Date();
    const fallback = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    return ymToRange(fallback);
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const last = daysInMonth(y, mo);
  return { startYmd: `${y}-${pad2(mo)}-01`, endYmd: `${y}-${pad2(mo)}-${pad2(last)}` };
}

export function yearToRange(year: number): { startYmd: string; endYmd: string } {
  return { startYmd: `${year}-01-01`, endYmd: `${year}-12-31` };
}

export function rangeYmToYmd(startYm: string, endYm: string): { startYmd: string; endYmd: string } {
  const a = ymToRange(startYm);
  const b = ymToRange(endYm);
  return a.startYmd <= b.startYmd
    ? { startYmd: a.startYmd, endYmd: b.endYmd }
    : { startYmd: b.startYmd, endYmd: a.endYmd };
}

export function listMonthsInRange(startYm: string, endYm: string): string[] {
  const { startYmd, endYmd } = rangeYmToYmd(startYm, endYm);
  const out: string[] = [];
  let y = parseInt(startYmd.slice(0, 4), 10);
  let mo = parseInt(startYmd.slice(5, 7), 10);
  const endY = parseInt(endYmd.slice(0, 4), 10);
  const endMo = parseInt(endYmd.slice(5, 7), 10);
  while (y < endY || (y === endY && mo <= endMo)) {
    out.push(`${y}-${pad2(mo)}`);
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return out;
}

export function summerRangeForYear(year: number): { startYmd: string; endYmd: string } {
  return { startYmd: `${year}-07-01`, endYmd: `${year}-09-30` };
}

/** 冬季 = 前年12月〜当年2月（例: 2024年冬季 = 2023-12-01 〜 2024-02-29） */
export function winterRangeForYear(year: number): { startYmd: string; endYmd: string } {
  const prev = year - 1;
  const febLast = daysInMonth(year, 2);
  return { startYmd: `${prev}-12-01`, endYmd: `${year}-02-${pad2(febLast)}` };
}

export function decemberRangeForYear(year: number): { startYmd: string; endYmd: string } {
  const last = daysInMonth(year, 12);
  return { startYmd: `${year}-12-01`, endYmd: `${year}-12-${pad2(last)}` };
}

export function discoverYearsFromVisits(visits: UtilizationVisitRow[]): number[] {
  const years = new Set<number>();
  for (const v of visits) {
    const d = ymdOnly(v.visit_date);
    const y = parseInt(d.slice(0, 4), 10);
    if (Number.isFinite(y) && y >= 2000 && y <= 2100) years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}

export function computeUtilizationForPeriod(params: {
  visits: UtilizationVisitRow[];
  excludeKeywords: string[];
  schedule: UtilizationScheduleConfig;
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi';
  startYmd: string;
  endYmd: string;
  label?: string;
}): UtilizationResult {
  const { visits, excludeKeywords, schedule, clinicFilter, startYmd, endYmd, label } = params;
  const scoped = visits.filter((v) => clinicMatchesRecord(clinicFilter, v.clinic_name));
  const qualifying = filterQualifyingVisits(scoped, excludeKeywords);
  const inPeriod = qualifying.filter((v) => {
    const d = ymdOnly(v.visit_date);
    return d >= startYmd && d <= endYmd;
  });
  const slotsUsed = totalWeightedSlotsUsed(
    inPeriod,
    schedule.menuSlotRules,
    schedule.defaultMenuSlotWeight
  );
  const useWeekly = hasWeeklyScheduleConfigured(schedule);
  const { maxSlots, operatingDays, calendarDays } = computeCapacityForPeriod({
    startYmd,
    endYmd,
    clinicFilter,
    schedule,
    useWeeklySchedule: useWeekly,
  });
  const denom = maxSlots > 0 ? maxSlots : 1;
  const utilizationRate = maxSlots === 0 ? 0 : Math.round((slotsUsed / denom) * 1000) / 10;

  return {
    label: label ?? `${startYmd} 〜 ${endYmd}`,
    startYmd,
    endYmd,
    slotsUsed,
    maxSlots,
    utilizationRate,
    calendarDays,
    operatingDays,
    lowSample: operatingDays < 5,
  };
}

export function computeMonthlyUtilization(params: {
  visits: UtilizationVisitRow[];
  excludeKeywords: string[];
  schedule: UtilizationScheduleConfig;
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi';
  months: string[];
}): UtilizationResult[] {
  return params.months.map((ym) => {
    const { startYmd, endYmd } = ymToRange(ym);
    const [y, m] = ym.split('-');
    return computeUtilizationForPeriod({
      ...params,
      startYmd,
      endYmd,
      label: `${y}年${parseInt(m, 10)}月`,
    });
  });
}

export function computeDecemberYoY(params: {
  visits: UtilizationVisitRow[];
  excludeKeywords: string[];
  schedule: UtilizationScheduleConfig;
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi';
  years: number[];
}): UtilizationResult[] {
  return params.years.map((year) => {
    const { startYmd, endYmd } = decemberRangeForYear(year);
    return computeUtilizationForPeriod({
      ...params,
      startYmd,
      endYmd,
      label: `${year}年12月`,
    });
  });
}

export function computeSeasonPair(params: {
  visits: UtilizationVisitRow[];
  excludeKeywords: string[];
  schedule: UtilizationScheduleConfig;
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi';
  year: number;
}): { summer: UtilizationResult; winter: UtilizationResult } {
  const summerR = summerRangeForYear(params.year);
  const winterR = winterRangeForYear(params.year);
  return {
    summer: computeUtilizationForPeriod({
      ...params,
      startYmd: summerR.startYmd,
      endYmd: summerR.endYmd,
      label: `${params.year}年 夏季（7〜9月）`,
    }),
    winter: computeUtilizationForPeriod({
      ...params,
      startYmd: winterR.startYmd,
      endYmd: winterR.endYmd,
      label: `${params.year}年 冬季（前年12月〜2月）`,
    }),
  };
}
