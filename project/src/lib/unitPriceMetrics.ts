import { clinicMatchesRecord } from './clinic';
import { filterQualifyingVisits } from './repeatMetrics';
import {
  effectiveTreatmentMinutes,
  parseMenuDurationRules,
  yenPerMinute,
  type MenuDurationRule,
} from './treatmentMinutes';

export type UnitPriceVisitRow = {
  visit_date: string;
  menu_name?: string | null;
  amount?: number | null;
  treatment_minutes?: number | null;
  clinic_name?: string | null;
  payment_detail_id?: string | null;
};

export type UnitPriceSegmentId = 'single' | 'be' | 'ticket' | 'program' | 'other';

export type UnitPriceSegmentSummary = {
  segmentId: UnitPriceSegmentId;
  label: string;
  visitCount: number;
  recordedCount: number;
  estimatedCount: number;
  totalAmount: number;
  totalMinutes: number;
  yenPerMinute: number;
};

const SEGMENT_LABELS: Record<UnitPriceSegmentId, string> = {
  single: '都度',
  be: 'BE継続',
  ticket: '回数券',
  program: 'プログラム',
  other: 'その他',
};

export function classifyUnitPriceSegment(
  menuName: string | null | undefined,
  paymentDetailName: string | null | undefined
): UnitPriceSegmentId {
  const text = `${menuName || ''} ${paymentDetailName || ''}`.toLowerCase();
  if (text.includes('be') || text.includes('継続')) return 'be';
  if (
    text.includes('回数') ||
    text.includes('券') ||
    text.includes('チケット') ||
    text.includes('ticket')
  ) {
    return 'ticket';
  }
  if (
    text.includes('プログラム') ||
    text.includes('6m') ||
    text.includes('3m') ||
    text.includes('12m') ||
    text.includes('6ヶ月') ||
    text.includes('6か月')
  ) {
    return 'program';
  }
  if (text.includes('都度') || text.includes('単発') || text.includes('初回') || text.includes('体験')) {
    return 'single';
  }
  if (menuName?.trim() || paymentDetailName?.trim()) return 'single';
  return 'other';
}

function ymdOnly(raw: string): string {
  return String(raw).slice(0, 10);
}

export function computeUnitPriceSummaries(params: {
  visits: UnitPriceVisitRow[];
  excludeKeywords: string[];
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi';
  startYmd: string;
  endYmd: string;
  menuDurationRules: string;
  defaultTreatmentMinutes: number;
  paymentDetailNames: Record<string, string>;
}): UnitPriceSegmentSummary[] {
  const rules = parseMenuDurationRules(params.menuDurationRules);
  const scoped = params.visits.filter((v) => clinicMatchesRecord(params.clinicFilter, v.clinic_name));
  const qualifying = filterQualifyingVisits(scoped, params.excludeKeywords);
  const inPeriod = qualifying.filter((v) => {
    const d = ymdOnly(v.visit_date);
    return d >= params.startYmd && d <= params.endYmd;
  });

  const buckets = new Map<UnitPriceSegmentId, UnitPriceSegmentSummary>();

  for (const v of inPeriod) {
    const amount = Number(v.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const eff = effectiveTreatmentMinutes({
      treatment_minutes: v.treatment_minutes,
      menu_name: v.menu_name,
      rules,
      defaultMinutes: params.defaultTreatmentMinutes,
    });
    if (!eff) continue;

    const pdName = v.payment_detail_id ? params.paymentDetailNames[v.payment_detail_id] : '';
    const segmentId = classifyUnitPriceSegment(v.menu_name, pdName);
    const cur = buckets.get(segmentId) || {
      segmentId,
      label: SEGMENT_LABELS[segmentId],
      visitCount: 0,
      recordedCount: 0,
      estimatedCount: 0,
      totalAmount: 0,
      totalMinutes: 0,
      yenPerMinute: 0,
    };
    cur.visitCount++;
    if (eff.source === 'recorded') cur.recordedCount++;
    else cur.estimatedCount++;
    cur.totalAmount += amount;
    cur.totalMinutes += eff.minutes;
    buckets.set(segmentId, cur);
  }

  const order: UnitPriceSegmentId[] = ['single', 'be', 'ticket', 'program', 'other'];
  return order
    .map((id) => buckets.get(id))
    .filter((x): x is UnitPriceSegmentSummary => Boolean(x && x.visitCount > 0))
    .map((s) => ({
      ...s,
      yenPerMinute: yenPerMinute(s.totalAmount, s.totalMinutes),
    }));
}

export function computeOverallUnitPrice(
  segments: UnitPriceSegmentSummary[]
): { yenPerMinute: number; visitCount: number; estimatedCount: number } | null {
  let totalAmount = 0;
  let totalMinutes = 0;
  let visitCount = 0;
  let estimatedCount = 0;
  for (const s of segments) {
    totalAmount += s.totalAmount;
    totalMinutes += s.totalMinutes;
    visitCount += s.visitCount;
    estimatedCount += s.estimatedCount;
  }
  if (totalMinutes <= 0) return null;
  return {
    yenPerMinute: yenPerMinute(totalAmount, totalMinutes),
    visitCount,
    estimatedCount,
  };
}
