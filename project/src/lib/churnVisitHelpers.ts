import { menuNameExcluded } from './businessRules';
import type { VisitForContract } from './churnContractType';
import {
  classifyContractType,
  classifyProgramSubType,
  type ContractType,
  type ProgramSubType,
} from './churnContractType';

export type ChurnVisitRow = VisitForContract & {
  clinic_name?: string | null;
};

export function ymdOnly(raw: string): string {
  return String(raw).slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normText(raw: string | null | undefined): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

export function textHasKeyword(haystack: string, keywords: string[]): boolean {
  if (!haystack) return false;
  return keywords.some((k) => {
    const key = normText(k);
    return key.length > 0 && haystack.includes(key);
  });
}

export function visitSearchBlob(
  visit: VisitForContract,
  paymentDetailNames: Record<string, string>
): string {
  const pd =
    visit.payment_detail_id && paymentDetailNames[visit.payment_detail_id]
      ? paymentDetailNames[visit.payment_detail_id]
      : '';
  return normText([visit.menu_name, visit.import_kind_text, pd].filter(Boolean).join(' '));
}

export function isMainProductVisit(
  visit: VisitForContract,
  mainProductKeywords: string[],
  paymentDetailNames: Record<string, string>
): boolean {
  return textHasKeyword(visitSearchBlob(visit, paymentDetailNames), mainProductKeywords);
}

export function isFinalVisitMarker(
  visit: VisitForContract,
  finalVisitKeywords: string[],
  paymentDetailNames: Record<string, string>
): boolean {
  return textHasKeyword(visitSearchBlob(visit, paymentDetailNames), finalVisitKeywords);
}

export function isRevisitMarker(
  visit: VisitForContract,
  revisitKeywords: string[],
  paymentDetailNames: Record<string, string>
): boolean {
  return textHasKeyword(visitSearchBlob(visit, paymentDetailNames), revisitKeywords);
}

/** exclude_keywords 以外の来院（経営ルールの設定のみ。コード側で勝手に足さない） */
export function filterCountingVisits(visits: ChurnVisitRow[], excludeKeywords: string[]): ChurnVisitRow[] {
  return visits.filter((v) => !menuNameExcluded(v.menu_name, excludeKeywords));
}

/** 初回（除外キーワード）のみで、実質通院ゼロ */
export function isShokaiOnlyCustomer(visits: ChurnVisitRow[], excludeKeywords: string[]): boolean {
  if (visits.length === 0) return true;
  return filterCountingVisits(visits, excludeKeywords).length === 0;
}

export function sortVisitsAsc(visits: ChurnVisitRow[]): ChurnVisitRow[] {
  return [...visits].sort((a, b) => {
    const d = ymdOnly(a.visit_date).localeCompare(ymdOnly(b.visit_date));
    if (d !== 0) return d;
    return String(a.visit_date).localeCompare(String(b.visit_date));
  });
}

/** 本商品（BE）購入が記録された最初の来院 */
export function findFirstMainProductVisit(
  visits: ChurnVisitRow[],
  mainProductKeywords: string[],
  paymentDetailNames: Record<string, string>
): ChurnVisitRow | null {
  for (const v of sortVisitsAsc(visits)) {
    if (isMainProductVisit(v, mainProductKeywords, paymentDetailNames)) return v;
  }
  return null;
}

export function hasAnyVisitInRange(
  visits: ChurnVisitRow[],
  startExclusive: string,
  endInclusive: string
): boolean {
  const start = ymdOnly(startExclusive);
  const end = ymdOnly(endInclusive);
  return visits.some((v) => {
    const d = ymdOnly(v.visit_date);
    return d > start && d <= end;
  });
}

export function hasRepurchaseAfter(
  visits: ChurnVisitRow[],
  afterExclusive: string,
  endInclusive: string,
  mainProductKeywords: string[],
  programKeywords: string[],
  revisitKeywords: string[],
  paymentDetailNames: Record<string, string>
): boolean {
  const start = ymdOnly(afterExclusive);
  const end = ymdOnly(endInclusive);
  return sortVisitsAsc(visits).some((v) => {
    const d = ymdOnly(v.visit_date);
    if (d <= start || d > end) return false;
    if (isRevisitMarker(v, revisitKeywords, paymentDetailNames)) return true;
    if (isMainProductVisit(v, mainProductKeywords, paymentDetailNames)) return true;
    const t = classifyContractType(v, programKeywords, paymentDetailNames);
    return t === 'single' || t === 'ticket' || t === 'program';
  });
}

export function findFirstFinalVisitAfter(
  visits: ChurnVisitRow[],
  afterInclusive: string,
  finalVisitKeywords: string[],
  paymentDetailNames: Record<string, string>
): ChurnVisitRow | null {
  const after = ymdOnly(afterInclusive);
  for (const v of sortVisitsAsc(visits)) {
    const d = ymdOnly(v.visit_date);
    if (d < after) continue;
    if (isFinalVisitMarker(v, finalVisitKeywords, paymentDetailNames)) return v;
  }
  return null;
}

const PROGRAM_DURATION_DAYS: Record<ProgramSubType, number> = {
  prog_3m: 90,
  prog_6m: 180,
  prog_10_12m: 365,
  prog_other: 180,
};

export function estimateProgramEndYmd(
  t0: string,
  conversionVisit: VisitForContract,
  programKeywords: string[],
  paymentDetailNames: Record<string, string>,
  finalVisitKeywords: string[],
  visits: ChurnVisitRow[]
): string | null {
  const finalV = findFirstFinalVisitAfter(visits, t0, finalVisitKeywords, paymentDetailNames);
  if (finalV) return ymdOnly(finalV.visit_date);
  const sub = classifyProgramSubType(conversionVisit, paymentDetailNames);
  return addDaysYmd(ymdOnly(t0), PROGRAM_DURATION_DAYS[sub]);
}

export type MainProductEpisode = {
  t0: string;
  t0Visit: ChurnVisitRow;
  contractType: ContractType;
  programSubType?: ProgramSubType;
};

export function buildMainProductEpisode(
  visits: ChurnVisitRow[],
  mainProductKeywords: string[],
  programKeywords: string[],
  paymentDetailNames: Record<string, string>
): MainProductEpisode | null {
  const t0Visit = findFirstMainProductVisit(visits, mainProductKeywords, paymentDetailNames);
  if (!t0Visit) return null;
  const t0 = ymdOnly(t0Visit.visit_date);
  const contractType = classifyContractType(t0Visit, programKeywords, paymentDetailNames);
  const episode: MainProductEpisode = { t0, t0Visit, contractType };
  if (contractType === 'program') {
    episode.programSubType = classifyProgramSubType(t0Visit, paymentDetailNames);
  }
  return episode;
}
