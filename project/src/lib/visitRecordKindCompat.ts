import type { Database } from './database.types';
import { normalizeForMasterMatch } from './paymentDisplay';

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

/** メモ先頭の「［種類: …］」を除去（種類は import_kind_text / マスタ側で管理） */
export function stripKindPrefixFromMemo(memo: string | null | undefined): string | null {
  if (memo == null) return null;
  const next = String(memo).replace(KIND_IN_MEMO_RE, '').trim();
  return next || null;
}

/** CSV・取込の種類文字列を payment_detail マスタ id に寄せる（完全一致のみ） */
export function resolvePaymentDetailIdFromKindLabel(
  label: string | null | undefined,
  details: { id: string; name: string }[]
): string | null {
  const norm = normalizeForMasterMatch(label);
  if (!norm) return null;
  const hit = details.find((d) => normalizeForMasterMatch(d.name) === norm);
  return hit?.id ?? null;
}

/** 来院行の「種類」表示用ラベル（取込列は画面保存後は使わない） */
export function legacyImportKindLabel(row: {
  import_kind_text?: string | null;
  memo?: string | null;
}): string | null {
  const fromCol = row.import_kind_text != null && String(row.import_kind_text).trim() !== ''
    ? String(row.import_kind_text).trim()
    : null;
  if (fromCol) return fromCol;
  return parseKindFromImportMemo(row.memo);
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
  return isMissingVisitColumnError(err, 'import_kind_text');
}

export function isMissingVisitColumnError(err: unknown, column: string): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === 'PGRST204' && String(e.message || '').includes(column);
}

/** 個人カルテ・来院修正で menu_name を決める（マスタ → 自由入力 → 種類マスタ → 取込種類） */
export function resolveVisitMenuNameForSave(opts: {
  menuMasterName: string | null | undefined;
  menuFreeText: string;
  paymentDetailName: string | null | undefined;
  legacyKindLabel: string;
}): string | null {
  const fromMaster = (opts.menuMasterName || '').trim();
  if (fromMaster) return fromMaster;
  const free = opts.menuFreeText.trim();
  if (free) return free;
  const detail = (opts.paymentDetailName || '').trim();
  if (detail) return detail;
  const legacy = opts.legacyKindLabel.trim();
  if (legacy) return legacy;
  return null;
}

export function visitUpdateOmittingImportKindText<T extends Record<string, unknown>>(row: T): Omit<T, 'import_kind_text'> {
  const { import_kind_text: _ik, ...rest } = row;
  return rest;
}
