import { DEFAULT_WATCH_LAYOUT_KEYS, type WatchLayoutItemKey } from './watchLayout';

/** 会員ルームの購入プログラム */
export type ProgramTier = 'p10' | 'p20' | 'p30';

/** 鍵ルール側の必要プログラム（万円） */
export type ProgramMinTier = 10 | 20 | 30;

export type ProgramItemRule = {
  item_key: string;
  min_tier: ProgramMinTier;
  updated_at?: string;
};

export type ProgramItemAccess = {
  item_key: string;
  min_tier: ProgramMinTier;
  unlocked: boolean;
};

export const PROGRAM_TIER_OPTIONS: {
  value: ProgramTier;
  rank: ProgramMinTier;
  label: string;
  shortLabel: string;
}[] = [
  { value: 'p10', rank: 10, label: '10万円プログラム', shortLabel: '10万' },
  { value: 'p20', rank: 20, label: '20万円プログラム', shortLabel: '20万' },
  { value: 'p30', rank: 30, label: '30万円プログラム', shortLabel: '30万' },
];

export const PROGRAM_MIN_TIER_OPTIONS: {
  value: ProgramMinTier;
  label: string;
}[] = [
  { value: 10, label: '10万円〜（全員）' },
  { value: 20, label: '20万円〜' },
  { value: 30, label: '30万円のみ' },
];

export function isProgramTier(value: unknown): value is ProgramTier {
  return value === 'p10' || value === 'p20' || value === 'p30';
}

export function isProgramMinTier(value: unknown): value is ProgramMinTier {
  return value === 10 || value === 20 || value === 30;
}

export function programTierRank(tier: ProgramTier | null | undefined): ProgramMinTier {
  if (tier === 'p10') return 10;
  if (tier === 'p20') return 20;
  return 30;
}

export function programTierLabel(tier: ProgramTier | null | undefined): string {
  const found = PROGRAM_TIER_OPTIONS.find((o) => o.value === tier);
  return found?.label || '30万円プログラム';
}

export function programTierShortLabel(tier: ProgramTier | null | undefined): string {
  const found = PROGRAM_TIER_OPTIONS.find((o) => o.value === tier);
  return found?.shortLabel || '30万';
}

export function programMinTierLabel(minTier: ProgramMinTier): string {
  const found = PROGRAM_MIN_TIER_OPTIONS.find((o) => o.value === minTier);
  return found?.label || `${minTier}万円〜`;
}

export function isItemUnlocked(memberTier: ProgramTier, minTier: ProgramMinTier): boolean {
  return programTierRank(memberTier) >= minTier;
}

/** ルール未設定時は開放（既存ルームを壊さない） */
export function buildAccessMap(
  rules: ProgramItemRule[],
  memberTier: ProgramTier
): Record<string, ProgramItemAccess> {
  const map: Record<string, ProgramItemAccess> = {};
  for (const key of DEFAULT_WATCH_LAYOUT_KEYS) {
    const rule = rules.find((r) => r.item_key === key);
    const minTier = rule?.min_tier ?? 10;
    map[key] = {
      item_key: key,
      min_tier: minTier,
      unlocked: isItemUnlocked(memberTier, minTier),
    };
  }
  for (const rule of rules) {
    if (map[rule.item_key]) continue;
    map[rule.item_key] = {
      item_key: rule.item_key,
      min_tier: rule.min_tier,
      unlocked: isItemUnlocked(memberTier, rule.min_tier),
    };
  }
  return map;
}

export function countAccessSummary(
  rules: ProgramItemRule[],
  memberTier: ProgramTier,
  keys: WatchLayoutItemKey[] = DEFAULT_WATCH_LAYOUT_KEYS
): { unlocked: number; locked: number; total: number } {
  const map = buildAccessMap(rules, memberTier);
  let unlocked = 0;
  let locked = 0;
  for (const key of keys) {
    if (map[key]?.unlocked) unlocked += 1;
    else locked += 1;
  }
  return { unlocked, locked, total: keys.length };
}

export const LOCKED_ITEM_MESSAGE = 'ご購入のプログラムでは、この枠はまだ開けません';
