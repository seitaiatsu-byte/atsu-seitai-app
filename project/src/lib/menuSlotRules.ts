export type MenuSlotRule = { keyword: string; slots: number };

/** 1行1件: メニュー名キーワード:消費枠（1=標準、0.5=半枠、2=2枠分） */
export function parseMenuSlotRules(raw: string): MenuSlotRule[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      const keyword = line.slice(0, idx).trim().toLowerCase();
      const slots = parseFloat(line.slice(idx + 1).trim());
      if (!keyword || !Number.isFinite(slots) || slots <= 0) return null;
      return { keyword, slots };
    })
    .filter((x): x is MenuSlotRule => Boolean(x));
}

export function serializeMenuSlotRules(rules: MenuSlotRule[]): string {
  return rules.map((r) => `${r.keyword}:${r.slots}`).join('\n');
}

/** メニュー名に最初にマッチしたルールの消費枠。未マッチは defaultSlots（通常1） */
export function visitSlotWeight(
  menuName: string | null | undefined,
  rules: MenuSlotRule[],
  defaultSlots = 1
): number {
  const label = String(menuName ?? '').trim().toLowerCase();
  if (!label) return defaultSlots;
  const hit = rules.find((r) => r.keyword && label.includes(r.keyword));
  return hit ? hit.slots : defaultSlots;
}

export function totalWeightedSlotsUsed(
  visits: { menu_name?: string | null }[],
  rules: MenuSlotRule[],
  defaultSlots = 1
): number {
  const sum = visits.reduce((acc, v) => acc + visitSlotWeight(v.menu_name, rules, defaultSlots), 0);
  return Math.round(sum * 10) / 10;
}
