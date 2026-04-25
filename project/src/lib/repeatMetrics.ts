import { menuNameExcluded } from './businessRules';

export type VisitLite = { visit_date: string; menu_name?: string | null };

/** 除外キーワードを含まない来院のみカウント対象 */
export function filterQualifyingVisits(visits: VisitLite[], excludeKeywords: string[]): VisitLite[] {
  return visits.filter((v) => !menuNameExcluded(v.menu_name, excludeKeywords));
}

/** 初診日（最初の対象来院日） */
export function firstQualifyingVisitDate(visits: VisitLite[], excludeKeywords: string[]): string | null {
  const q = filterQualifyingVisits(visits, excludeKeywords).sort(
    (a, b) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime()
  );
  return q[0]?.visit_date ?? null;
}

/**
 * 調整リピート回数（来院ベース）: 対象来院数 - 1。
 * 初診当日の物販を「リピート1回目」とみなさないのは物販ベースの並びでは別処理。
 */
export function qualifyingVisitRepeatCount(visits: VisitLite[], excludeKeywords: string[]): number {
  const n = filterQualifyingVisits(visits, excludeKeywords).length;
  return Math.max(0, n - 1);
}

export type CustomerForRepeat = {
  id: string;
  visits: { visit_date: string; menu_name?: string | null }[];
};

/** 2回目リピート率: 初回対象来院がある顧客のうち、対象来院が2回以上の割合 */
export function repeatRateSecond(customers: CustomerForRepeat[], excludeKeywords: string[]): number {
  let denom = 0;
  let num = 0;
  for (const c of customers) {
    const q = filterQualifyingVisits(c.visits, excludeKeywords);
    if (q.length >= 1) {
      denom++;
      if (q.length >= 2) num++;
    }
  }
  return denom === 0 ? 0 : Math.round((num / denom) * 1000) / 10;
}

/** 6回目まで到達率: 対象来院が6回以上の顧客 / 初回あり顧客 */
export function repeatRateSixth(customers: CustomerForRepeat[], excludeKeywords: string[]): number {
  let denom = 0;
  let num = 0;
  for (const c of customers) {
    const q = filterQualifyingVisits(c.visits, excludeKeywords);
    if (q.length >= 1) {
      denom++;
      if (q.length >= 6) num++;
    }
  }
  return denom === 0 ? 0 : Math.round((num / denom) * 1000) / 10;
}
