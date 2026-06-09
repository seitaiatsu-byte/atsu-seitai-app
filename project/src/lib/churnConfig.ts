import { supabase } from './supabase';

export type ChurnConfig = {
  programKeywords: string[];
  windowsSingle: number[];
  windowsProgram: number[];
  windowsTicket: number[];
};

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

export const DEFAULT_CHURN_CONFIG: ChurnConfig = {
  programKeywords: DEFAULT_PROGRAM_KEYWORDS,
  windowsSingle: [90, 180],
  windowsProgram: [180, 365, 548, 730],
  windowsTicket: [180, 365, 548, 730],
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
      'churn_program_keywords',
      'churn_windows_single',
      'churn_windows_program',
      'churn_windows_ticket',
    ]);

  if (error || !data?.length) return DEFAULT_CHURN_CONFIG;

  const map = Object.fromEntries(data.map((r) => [r.rule_key, r.rule_value]));
  return {
    programKeywords: parseCommaList(map.churn_program_keywords, DEFAULT_PROGRAM_KEYWORDS),
    windowsSingle: parseDayList(map.churn_windows_single, DEFAULT_CHURN_CONFIG.windowsSingle),
    windowsProgram: parseDayList(map.churn_windows_program, DEFAULT_CHURN_CONFIG.windowsProgram),
    windowsTicket: parseDayList(map.churn_windows_ticket, DEFAULT_CHURN_CONFIG.windowsTicket),
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
