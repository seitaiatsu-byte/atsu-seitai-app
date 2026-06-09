/** メニュー別の標準施術時間（経営ルール）と来院記録の枠時間 */

export type MenuDurationRule = { keyword: string; minutes: number };

export function parseMenuDurationRules(raw: string): MenuDurationRule[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      const keyword = line.slice(0, idx).trim().toLowerCase();
      const minutes = parseInt(line.slice(idx + 1).trim(), 10);
      if (!keyword || !Number.isFinite(minutes) || minutes <= 0) return null;
      return { keyword, minutes };
    })
    .filter((x): x is MenuDurationRule => Boolean(x));
}

export function guessMinutesFromMenu(
  menuName: string | null | undefined,
  rules: MenuDurationRule[],
  defaultMinutes: number
): number {
  const label = String(menuName ?? '').trim().toLowerCase();
  if (!label) return defaultMinutes;
  const hit = rules.find((r) => r.keyword && label.includes(r.keyword));
  return hit ? hit.minutes : defaultMinutes;
}

export function effectiveTreatmentMinutes(params: {
  treatment_minutes?: number | null;
  menu_name?: string | null;
  rules: MenuDurationRule[];
  defaultMinutes: number;
}): { minutes: number; source: 'recorded' | 'estimated' } | null {
  const recorded = params.treatment_minutes;
  if (recorded != null && Number.isFinite(recorded) && recorded > 0) {
    return { minutes: recorded, source: 'recorded' };
  }
  const menu = String(params.menu_name ?? '').trim();
  if (!menu) return null;
  return {
    minutes: guessMinutesFromMenu(menu, params.rules, params.defaultMinutes),
    source: 'estimated',
  };
}

export function yenPerMinute(amount: number, minutes: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round((amount / minutes) * 10) / 10;
}
