import {
  effectiveTreatmentMinutes,
  parseMenuDurationRules,
  yenPerMinute,
} from './treatmentMinutes';

export type CustomerChartVisitRow = {
  visit_date: string;
  amount?: number | null;
  menu_name?: string | null;
  treatment_minutes?: number | null;
};

export type CustomerChartProductRow = {
  sale_date: string;
  amount?: number | null;
};

export type CustomerChartSubRow = {
  start_date: string;
  amount?: number | null;
};

export type CustomerLtvPeriodMode = 'all' | 'last6m' | 'last12m' | 'custom';

export type CustomerLtvMetrics = {
  startYmd: string | null;
  endYmd: string | null;
  ltvTotal: number;
  visitRevenue: number;
  productRevenue: number;
  subscriptionRevenue: number;
  visitCount: number;
  unitPriceVisitCount: number;
  totalMinutes: number;
  recordedMinutesCount: number;
  estimatedMinutesCount: number;
  skippedVisitCount: number;
  yenPerMinute: number | null;
};

function ymdOnly(raw: string): string {
  return String(raw).slice(0, 10);
}

function inPeriod(date: string, startYmd: string | null, endYmd: string | null): boolean {
  const d = ymdOnly(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (startYmd && d < startYmd) return false;
  if (endYmd && d > endYmd) return false;
  return true;
}

function shiftYmdMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1 + months, d, 12, 0, 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function resolveCustomerLtvPeriod(params: {
  mode: CustomerLtvPeriodMode;
  customStart: string;
  customEnd: string;
  todayYmd?: string;
}): { startYmd: string | null; endYmd: string | null } {
  const today = (params.todayYmd || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (params.mode === 'all') return { startYmd: null, endYmd: null };
  if (params.mode === 'last6m') return { startYmd: shiftYmdMonths(today, -6), endYmd: today };
  if (params.mode === 'last12m') return { startYmd: shiftYmdMonths(today, -12), endYmd: today };
  const start = params.customStart.trim().slice(0, 10);
  const end = params.customEnd.trim().slice(0, 10);
  const startOk = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const endOk = /^\d{4}-\d{2}-\d{2}$/.test(end);
  if (!startOk && !endOk) return { startYmd: null, endYmd: null };
  if (startOk && endOk && start > end) return { startYmd: end, endYmd: start };
  return { startYmd: startOk ? start : null, endYmd: endOk ? end : null };
}

export function computeCustomerLtvMetrics(params: {
  visits: CustomerChartVisitRow[];
  products: CustomerChartProductRow[];
  subs: CustomerChartSubRow[];
  startYmd: string | null;
  endYmd: string | null;
  menuDurationRules: string;
  defaultTreatmentMinutes: number;
}): CustomerLtvMetrics {
  const rules = parseMenuDurationRules(params.menuDurationRules);
  const scopedVisits = params.visits.filter((v) => inPeriod(v.visit_date, params.startYmd, params.endYmd));
  const scopedProducts = params.products.filter((p) => inPeriod(p.sale_date, params.startYmd, params.endYmd));
  const scopedSubs = params.subs.filter((s) => inPeriod(s.start_date, params.startYmd, params.endYmd));

  const visitRevenue = scopedVisits.reduce((s, v) => s + Number(v.amount || 0), 0);
  const productRevenue = scopedProducts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const subscriptionRevenue = scopedSubs.reduce((s, x) => s + Number(x.amount || 0), 0);

  let unitPriceVisitCount = 0;
  let totalMinutes = 0;
  let recordedMinutesCount = 0;
  let estimatedMinutesCount = 0;
  let skippedVisitCount = 0;
  let unitPriceRevenue = 0;

  for (const v of scopedVisits) {
    const amount = Number(v.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const eff = effectiveTreatmentMinutes({
      treatment_minutes: v.treatment_minutes,
      menu_name: v.menu_name,
      rules,
      defaultMinutes: params.defaultTreatmentMinutes,
    });
    if (!eff) {
      skippedVisitCount++;
      continue;
    }

    unitPriceVisitCount++;
    unitPriceRevenue += amount;
    totalMinutes += eff.minutes;
    if (eff.source === 'recorded') recordedMinutesCount++;
    else estimatedMinutesCount++;
  }

  return {
    startYmd: params.startYmd,
    endYmd: params.endYmd,
    ltvTotal: visitRevenue + productRevenue + subscriptionRevenue,
    visitRevenue,
    productRevenue,
    subscriptionRevenue,
    visitCount: scopedVisits.length,
    unitPriceVisitCount,
    totalMinutes,
    recordedMinutesCount,
    estimatedMinutesCount,
    skippedVisitCount,
    yenPerMinute: totalMinutes > 0 ? yenPerMinute(unitPriceRevenue, totalMinutes) : null,
  };
}

export function formatCustomerLtvPeriodLabel(startYmd: string | null, endYmd: string | null): string {
  if (!startYmd && !endYmd) return '全期間';
  if (startYmd && endYmd) {
    return `${startYmd.replace(/-/g, '/')} 〜 ${endYmd.replace(/-/g, '/')}`;
  }
  if (startYmd) return `${startYmd.replace(/-/g, '/')} 〜`;
  return `〜 ${String(endYmd).replace(/-/g, '/')}`;
}
