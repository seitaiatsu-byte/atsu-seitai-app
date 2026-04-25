import { supabase } from './supabase';

/** アラート画面の4区分。経過日数 d = 最終来院からの日数。 */
export type AlertFollowConfig = {
  /** アクティブ: d < activeMaxExclusive */
  activeMaxExclusive: number;
  /** 帯1の終了（日）: activeMaxExclusive <= d < tier1End */
  tier1End: number;
  /** 帯2の終了: tier1End <= d < tier2End。帯3は d >= tier2End */
  tier2End: number;
};

export const DEFAULT_ALERT_FOLLOW: AlertFollowConfig = {
  activeMaxExclusive: 30,
  tier1End: 60,
  tier2End: 90,
};

export const ALERT_FOLLOW_RULE_KEYS = {
  active: 'alert_active_max_exclusive',
  t1: 'alert_tier1_end',
  t2: 'alert_tier2_end',
} as const;

export function parseAlertFollowFromMap(
  map: Record<string, string | undefined> | null | undefined
): AlertFollowConfig {
  const d = DEFAULT_ALERT_FOLLOW;
  if (!map) return { ...d };
  const a = parseInt(String(map[ALERT_FOLLOW_RULE_KEYS.active] ?? ''), 10);
  const t1 = parseInt(String(map[ALERT_FOLLOW_RULE_KEYS.t1] ?? ''), 10);
  const t2 = parseInt(String(map[ALERT_FOLLOW_RULE_KEYS.t2] ?? ''), 10);
  return {
    activeMaxExclusive: Number.isFinite(a) && a > 0 ? a : d.activeMaxExclusive,
    tier1End: Number.isFinite(t1) && t1 > 0 ? t1 : d.tier1End,
    tier2End: Number.isFinite(t2) && t2 > 0 ? t2 : d.tier2End,
  };
}

export function validateAlertFollowConfig(c: AlertFollowConfig): string | null {
  if (c.activeMaxExclusive >= c.tier1End || c.tier1End >= c.tier2End) {
    return '日数帯は「アクティブ＜帯1の区切り＜帯2の区切り」となるよう、1以上の整数で指定してください。';
  }
  if (c.tier2End > 2000) return '日数が大きすぎます。';
  return null;
}

export function labelYellowRange(c: AlertFollowConfig): string {
  return `${c.activeMaxExclusive}〜${c.tier1End - 1}日`;
}

export function labelOrangeRange(c: AlertFollowConfig): string {
  return `${c.tier1End}〜${c.tier2End - 1}日`;
}

export function labelRedRange(c: AlertFollowConfig): string {
  return `${c.tier2End}日以上`;
}

export function labelActiveShort(c: AlertFollowConfig): string {
  return `${c.activeMaxExclusive}日未満`;
}

export async function fetchAlertFollowConfig(): Promise<AlertFollowConfig> {
  const { data } = await supabase
    .from('business_rules')
    .select('rule_key, rule_value')
    .in('rule_key', [ALERT_FOLLOW_RULE_KEYS.active, ALERT_FOLLOW_RULE_KEYS.t1, ALERT_FOLLOW_RULE_KEYS.t2]);
  const map: Record<string, string> = {};
  (data || []).forEach((r: { rule_key: string; rule_value: string }) => {
    map[r.rule_key] = r.rule_value;
  });
  return parseAlertFollowFromMap(map);
}

export async function upsertAlertFollowConfig(c: AlertFollowConfig): Promise<void> {
  const err = validateAlertFollowConfig(c);
  if (err) throw new Error(err);
  const rows = [
    {
      rule_key: ALERT_FOLLOW_RULE_KEYS.active,
      rule_value: String(c.activeMaxExclusive),
      description: 'アラート: 最終来院の経過日数が未満なら「アクティブ」（従来30日）',
    },
    {
      rule_key: ALERT_FOLLOW_RULE_KEYS.t1,
      rule_value: String(c.tier1End),
      description: 'アラート: 2番目の帯の上端日数（従来60）',
    },
    {
      rule_key: ALERT_FOLLOW_RULE_KEYS.t2,
      rule_value: String(c.tier2End),
      description: 'アラート: 3番目の帯の上端日数（従来90）',
    },
  ] as const;
  for (const r of rows) {
    const { error } = await supabase.from('business_rules').upsert(r, { onConflict: 'rule_key' });
    if (error) throw error;
  }
}
