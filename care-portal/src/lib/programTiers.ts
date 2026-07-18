import { DEFAULT_WATCH_LAYOUT_KEYS, type WatchLayoutItemKey } from './watchLayout';

/** 会員ルームの購入プログラム区分（固定コード） */
export type ProgramTier = 'A' | 'B' | 'C' | 'D' | 'E';

export type ProgramDef = {
  code: ProgramTier;
  display_name: string;
  sort_order?: number;
  updated_at?: string;
};

export type ProgramItemRule = {
  item_key: string;
  allowed_tiers: ProgramTier[];
  updated_at?: string;
};

export type ProgramItemAccess = {
  item_key: string;
  allowed_tiers: ProgramTier[];
  unlocked: boolean;
};

export const PROGRAM_TIER_CODES: ProgramTier[] = ['A', 'B', 'C', 'D', 'E'];

export const DEFAULT_PROGRAM_DEFS: ProgramDef[] = PROGRAM_TIER_CODES.map((code, i) => ({
  code,
  display_name: code,
  sort_order: i + 1,
}));

export function isProgramTier(value: unknown): value is ProgramTier {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E';
}

export function normalizeAllowedTiers(value: unknown): ProgramTier[] {
  if (!Array.isArray(value)) return [...PROGRAM_TIER_CODES];
  const out = value.map((v) => String(v).toUpperCase()).filter(isProgramTier);
  return out.length > 0 ? out : [];
}

export function programTierLabel(
  tier: ProgramTier | null | undefined,
  defs: ProgramDef[] = DEFAULT_PROGRAM_DEFS
): string {
  const found = defs.find((d) => d.code === tier);
  return found?.display_name?.trim() || tier || 'E';
}

export function programTierShortLabel(
  tier: ProgramTier | null | undefined,
  defs: ProgramDef[] = DEFAULT_PROGRAM_DEFS
): string {
  return programTierLabel(tier, defs);
}

export function isItemUnlocked(memberTier: ProgramTier, allowedTiers: ProgramTier[]): boolean {
  return allowedTiers.includes(memberTier);
}

/** ルール未設定時は全開放 */
export function buildAccessMap(
  rules: ProgramItemRule[],
  memberTier: ProgramTier
): Record<string, ProgramItemAccess> {
  const map: Record<string, ProgramItemAccess> = {};
  for (const key of DEFAULT_WATCH_LAYOUT_KEYS) {
    const rule = rules.find((r) => r.item_key === key);
    const allowed = rule?.allowed_tiers?.length ? rule.allowed_tiers : [...PROGRAM_TIER_CODES];
    map[key] = {
      item_key: key,
      allowed_tiers: allowed,
      unlocked: isItemUnlocked(memberTier, allowed),
    };
  }
  for (const rule of rules) {
    if (map[rule.item_key]) continue;
    const allowed = rule.allowed_tiers?.length ? rule.allowed_tiers : [...PROGRAM_TIER_CODES];
    map[rule.item_key] = {
      item_key: rule.item_key,
      allowed_tiers: allowed,
      unlocked: isItemUnlocked(memberTier, allowed),
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

export function toggleAllowedTier(current: ProgramTier[], code: ProgramTier): ProgramTier[] {
  if (current.includes(code)) return current.filter((c) => c !== code);
  return PROGRAM_TIER_CODES.filter((c) => current.includes(c) || c === code);
}

export const LOCKED_ITEM_MESSAGE = 'ご購入のプログラムでは、この枠はまだ開けません';
