import { supabase } from './supabase';

export type BusinessRulesState = {
  inactiveDaysThreshold: number;
  excludeKeywords: string[];
  churnLapsedDays: number;
};

const defaults: BusinessRulesState = {
  inactiveDaysThreshold: 30,
  excludeKeywords: ['BE', '初回', '体験'],
  churnLapsedDays: 90,
};

export async function fetchBusinessRules(): Promise<BusinessRulesState> {
  const { data, error } = await supabase.from('business_rules').select('rule_key, rule_value');
  if (error || !data?.length) return defaults;

  const map = Object.fromEntries(data.map((r: { rule_key: string; rule_value: string }) => [r.rule_key, r.rule_value]));

  const inactive = parseInt(map.inactive_days_threshold || `${defaults.inactiveDaysThreshold}`, 10);
  const churn = parseInt(map.churn_lapsed_days || `${defaults.churnLapsedDays}`, 10);
  const rawKw = map.exclude_keywords;
  const excludeKeywords = (typeof rawKw === 'string' ? rawKw : defaults.excludeKeywords.join(','))
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  return {
    inactiveDaysThreshold: Number.isFinite(inactive) ? inactive : defaults.inactiveDaysThreshold,
    excludeKeywords: excludeKeywords.length ? excludeKeywords : defaults.excludeKeywords,
    churnLapsedDays: Number.isFinite(churn) ? churn : defaults.churnLapsedDays,
  };
}

export function menuNameExcluded(menuName: string | null | undefined, keywords: string[]): boolean {
  if (!menuName) return false;
  const lower = menuName.toLowerCase();
  return keywords.some((k) => k && lower.includes(k.toLowerCase()));
}
