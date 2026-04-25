/**
 * PostgREST / Supabase の error は通常 { message, code, details, hint } なので
 * `instanceof Error` が偽 → catch で String(err) が "[object Object]" になる。それを防ぐ。
 */
export function toErrorMessage(err: unknown): string {
  if (err == null) return '不明なエラー';
  if (err instanceof Error) return err.message || '不明なエラー';
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) {
      const parts: string[] = [o.message];
      if (typeof o.code === 'string' && o.code) parts.push(`[code: ${o.code}]`);
      if (typeof o.details === 'string' && o.details) parts.push(String(o.details));
      if (typeof o.hint === 'string' && o.hint) parts.push(`hint: ${o.hint}`);
      return parts.join(' ');
    }
    const code = typeof o.code === 'string' ? o.code : '';
    const det = typeof o.details === 'string' ? o.details : '';
    const hint = typeof o.hint === 'string' ? o.hint : '';
    if (code || det || hint) {
      return [code, det, hint].filter(Boolean).join(' / ');
    }
    try {
      return JSON.stringify(err);
    } catch {
      return '不明なエラー';
    }
  }
  if (typeof err === 'string') return err;
  return '不明なエラー';
}
