import { supabase } from './supabase';

export type ChurnConfig = {
  mainProductKeywords: string[];
  programKeywords: string[];
  finalVisitKeywords: string[];
  revisitKeywords: string[];
  windowsFlat: number[];
  windowsSingle: number[];
  windowsPostTicket: number[];
  windowsPostProgram: number[];
  windowsRevisit: number[];
};

export const DEFAULT_MAIN_PRODUCT_KEYWORDS = ['BE', '本商品', 'ボディメンテ', 'ボディメンテナンス'];

export const DEFAULT_PROGRAM_KEYWORDS = [
  '6M',
  '6ヶ月',
  '6か月',
  '3M',
  '3ヶ月',
  '3か月',
  '12M',
  '12ヶ月',
  '12か月',
  '10-12',
  '10〜12',
  'プログラム',
];

export const DEFAULT_FINAL_VISIT_KEYWORDS = ['プログラム最終', '最終回', '卒業', '終了'];

export const DEFAULT_REVISIT_KEYWORDS = ['再診', '再開', 'リピート再開'];

export const DEFAULT_CHURN_CONFIG: ChurnConfig = {
  mainProductKeywords: DEFAULT_MAIN_PRODUCT_KEYWORDS,
  programKeywords: DEFAULT_PROGRAM_KEYWORDS,
  finalVisitKeywords: DEFAULT_FINAL_VISIT_KEYWORDS,
  revisitKeywords: DEFAULT_REVISIT_KEYWORDS,
  windowsFlat: [90, 180],
  windowsSingle: [90, 180],
  windowsPostTicket: [90, 180, 365],
  windowsPostProgram: [90, 180, 365],
  windowsRevisit: [90, 180, 365],
};

export function parseCommaList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim()) return fallback;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

export function parseDayList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw?.trim()) return fallback;
  const nums = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? nums : fallback;
}

export async function fetchChurnConfig(): Promise<ChurnConfig> {
  const { data, error } = await supabase
    .from('business_rules')
    .select('rule_key, rule_value')
    .in('rule_key', [
      'churn_main_product_keywords',
      'churn_program_keywords',
      'churn_final_visit_keywords',
      'churn_revisit_keywords',
      'churn_windows_flat',
      'churn_windows_single',
      'churn_windows_post_ticket',
      'churn_windows_post_program',
      'churn_windows_revisit',
      'churn_windows_program',
      'churn_windows_ticket',
    ]);

  if (error || !data?.length) return DEFAULT_CHURN_CONFIG;

  const map = Object.fromEntries(data.map((r) => [r.rule_key, r.rule_value]));

  const postProgram = map.churn_windows_post_program
    ? parseDayList(map.churn_windows_post_program, DEFAULT_CHURN_CONFIG.windowsPostProgram)
    : parseDayList(map.churn_windows_program, DEFAULT_CHURN_CONFIG.windowsPostProgram);
  const postTicket = map.churn_windows_post_ticket
    ? parseDayList(map.churn_windows_post_ticket, DEFAULT_CHURN_CONFIG.windowsPostTicket)
    : parseDayList(map.churn_windows_ticket, DEFAULT_CHURN_CONFIG.windowsPostTicket);

  return {
    mainProductKeywords: parseCommaList(
      map.churn_main_product_keywords,
      DEFAULT_CHURN_CONFIG.mainProductKeywords
    ),
    programKeywords: parseCommaList(map.churn_program_keywords, DEFAULT_PROGRAM_KEYWORDS),
    finalVisitKeywords: parseCommaList(
      map.churn_final_visit_keywords,
      DEFAULT_CHURN_CONFIG.finalVisitKeywords
    ),
    revisitKeywords: parseCommaList(map.churn_revisit_keywords, DEFAULT_CHURN_CONFIG.revisitKeywords),
    windowsFlat: parseDayList(map.churn_windows_flat, DEFAULT_CHURN_CONFIG.windowsFlat),
    windowsSingle: parseDayList(map.churn_windows_single, DEFAULT_CHURN_CONFIG.windowsSingle),
    windowsPostTicket: postTicket,
    windowsPostProgram: postProgram,
    windowsRevisit: parseDayList(map.churn_windows_revisit, DEFAULT_CHURN_CONFIG.windowsRevisit),
  };
}

export function windowDaysLabel(days: number): string {
  if (days === 90) return '3ヶ月';
  if (days === 180) return '6ヶ月';
  if (days === 365) return '1年';
  if (days === 548) return '1.5年';
  if (days === 730) return '2年';
  if (days % 365 === 0) return `${days / 365}年`;
  if (days % 30 === 0) return `${days / 30}ヶ月`;
  return `${days}日`;
}
