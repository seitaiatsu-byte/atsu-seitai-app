import type { Database } from './database.types';

type VisitInsert = Database['public']['Tables']['visit_records']['Insert'];

/**
 * マイグレ未適用（import_kind_text 列なし）のとき: F 列（種類）をメモ先頭へ退避して挿入できるようにする
 */
const KIND_IN_MEMO_RE = /^\s*［種類:\s*([^］\n]+)］(?:\n|$)/u;

export function mergeKindIntoMemoForSchemaFallback(
  importKindText: string | null | undefined,
  memo: string | null | undefined
): string | null {
  const k = (importKindText && String(importKindText).trim()) || '';
  if (!k) return (memo && memo.trim()) || null;
  const prefix = `［種類: ${k}］`;
  const m = (memo || '').trim();
  if (!m) return prefix;
  return `${prefix}\n${m}`;
}

export function parseKindFromImportMemo(memo: string | null | undefined): string | null {
  if (memo == null) return null;
  const m = String(memo).match(KIND_IN_MEMO_RE);
  return m && m[1] != null && m[1].trim() !== '' ? m[1].trim() : null;
}

export function visitInsertOmittingImportKindText(row: VisitInsert): VisitInsert {
  const { import_kind_text, memo, ...rest } = row;
  const nextMemo = mergeKindIntoMemoForSchemaFallback(
    import_kind_text !== undefined && import_kind_text !== null
      ? String(import_kind_text)
      : null,
    memo ?? null
  );
  return { ...rest, memo: nextMemo } as VisitInsert;
}

export function isMissingImportKindTextColumnError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === 'PGRST204' && String(e.message || '').includes('import_kind_text');
}
