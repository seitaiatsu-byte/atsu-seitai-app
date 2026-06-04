/**
 * 来院日を YYYY-MM-DD に正規化（列挙用・保存用）
 * toISOString() はローカル日付を UTC へずらし、日本時間帯で「前日」にずれる原因になるため使わない。
 */
export function parseLocalVisitDateToYmd(raw: string): string | null {
  const t = String(raw)
    .replace(/^\uFEFF/, '')
    .replace(/\u3000/g, ' ')
    .trim();
  if (!t) return null;

  // 2026/4/23 / 2026.4.23
  const slash = t.match(/^(\d{1,4})[/.年](\d{1,2})[/.月](\d{1,2})/);
  if (slash) {
    const y = Number(slash[1]);
    const month = Number(slash[2]);
    const day = Number(slash[3]);
    if (y < 2000 || y > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const d = new Date(y, month - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 2026-04-23
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const d = new Date(y, month - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 最終手段: Date 互換（ずれ易いので toISOString 禁止）
  const u = t.replace(/-/g, '/');
  const d = new Date(u);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** DB の date 文字列を日付行に表示（UTC 解釈のズレを避ける） */
export function formatVisitDateJa(visitDate: string | null | undefined): string {
  if (visitDate == null || String(visitDate).trim() === '') return '—';
  const s = String(visitDate).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mo - 1, d).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  }
  return new Date(visitDate).toLocaleDateString('ja-JP');
}

export function getTodayLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 当月1日（YYYY-MM-DD）。サブスク開始日のデフォルト用 */
export function getFirstDayOfCurrentMonthLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** 日付グループ見出しの下の行用（年は見出しにあるので 6/4 のみ） */
export function formatVisitMonthDay(raw: unknown): string {
  const s = String(raw || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const m = parseInt(s.slice(5, 7), 10);
  const d = parseInt(s.slice(8, 10), 10);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return '—';
  return `${m}/${d}`;
}
