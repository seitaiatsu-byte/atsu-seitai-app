import { menuNameExcluded } from './businessRules';

export type ContractType = 'single' | 'program' | 'ticket';

export type ProgramSubType = 'prog_3m' | 'prog_6m' | 'prog_10_12m' | 'prog_other';

export type VisitForContract = {
  visit_date: string;
  menu_name?: string | null;
  import_kind_text?: string | null;
  import_ticket_count_raw?: string | null;
  payment_detail_id?: string | null;
};

const PROGRAM_SUB_RULES: { id: ProgramSubType; keywords: string[]; label: string }[] = [
  { id: 'prog_3m', keywords: ['3m', '3ヶ月', '3か月'], label: '3M契約' },
  { id: 'prog_6m', keywords: ['6m', '6ヶ月', '6か月'], label: '6M契約' },
  { id: 'prog_10_12m', keywords: ['10-12', '10〜12', '10~12', '12m', '12ヶ月', '12か月'], label: '10-12M契約' },
];

function normText(raw: string | null | undefined): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

function textHasKeyword(haystack: string, keywords: string[]): boolean {
  if (!haystack) return false;
  return keywords.some((k) => {
    const key = normText(k);
    return key.length > 0 && haystack.includes(key);
  });
}

function visitSearchBlob(
  visit: VisitForContract,
  paymentDetailNames: Record<string, string>
): string {
  const pd =
    visit.payment_detail_id && paymentDetailNames[visit.payment_detail_id]
      ? paymentDetailNames[visit.payment_detail_id]
      : '';
  return normText([visit.menu_name, visit.import_kind_text, pd].filter(Boolean).join(' '));
}

export function hasMeaningfulTicket(raw: string | null | undefined): boolean {
  const t = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!t) return false;
  if (/^[-ー－\s.・／/]+$/u.test(t)) return false;
  const lower = t.toLowerCase();
  if (['なし', '無', '未', 'n/a', '—', 'ー'].includes(lower)) return false;
  return true;
}

/** 成約来院（最初の有効来院）から契約タイプを判定 */
export function classifyContractType(
  conversionVisit: VisitForContract,
  programKeywords: string[],
  paymentDetailNames: Record<string, string>
): ContractType {
  const blob = visitSearchBlob(conversionVisit, paymentDetailNames);
  if (textHasKeyword(blob, programKeywords)) return 'program';
  if (hasMeaningfulTicket(conversionVisit.import_ticket_count_raw)) return 'ticket';
  return 'single';
}

export function classifyProgramSubType(
  conversionVisit: VisitForContract,
  paymentDetailNames: Record<string, string>
): ProgramSubType {
  const blob = visitSearchBlob(conversionVisit, paymentDetailNames);
  for (const rule of PROGRAM_SUB_RULES) {
    if (textHasKeyword(blob, rule.keywords)) return rule.id;
  }
  return 'prog_other';
}

export function programSubTypeLabel(sub: ProgramSubType): string {
  return PROGRAM_SUB_RULES.find((r) => r.id === sub)?.label ?? 'その他プログラム';
}

/** 有効来院のうち成約日と一致するレコード（同日複数あればプログラム優先） */
export function pickConversionVisit(
  qualifyingVisits: VisitForContract[],
  t0Ymd: string,
  programKeywords: string[],
  paymentDetailNames: Record<string, string>
): VisitForContract | null {
  const sameDay = qualifyingVisits.filter((v) => v.visit_date.slice(0, 10) === t0Ymd);
  if (sameDay.length === 0) return null;
  const ranked = [...sameDay].sort((a, b) => {
    const score = (v: VisitForContract) => {
      const t = classifyContractType(v, programKeywords, paymentDetailNames);
      if (t === 'program') return 3;
      if (t === 'ticket') return 2;
      return 1;
    };
    return score(b) - score(a);
  });
  return ranked[0] ?? null;
}

export function isExcludedMenuOnlyCustomer(
  visits: VisitForContract[],
  excludeKeywords: string[]
): boolean {
  if (visits.length === 0) return true;
  return visits.every((v) => menuNameExcluded(v.menu_name, excludeKeywords));
}
