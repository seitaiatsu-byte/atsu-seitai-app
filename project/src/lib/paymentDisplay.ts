import { parseKindFromImportMemo } from './visitRecordKindCompat';

/** 支払方法・種類（payment_detail）の表示・集計用（UUIDマスター／レガシー文字列の両対応。マスタ入替時は mergeIdNameMaps を使用） */

export type PaymentMethodBucket = 'cash' | 'card' | 'paypay' | 'other';

export function buildIdToNameMap(rows: { id: string; name: string }[] | null | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rows || []) m[r.id] = r.name;
  return m;
}

/** 支払／payment_detail マスタがDB上で入替のとき、UUID→名称をどちらのテーブルからでも解決する */
export function mergeIdNameMaps(
  a: { id: string; name: string }[] | null | undefined,
  b: { id: string; name: string }[] | null | undefined
): Record<string, string> {
  return { ...buildIdToNameMap(a), ...buildIdToNameMap(b) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/** DBの payment_method（マスタUUID or 現金/カード等の文字列）を表示名に */
export function formatPaymentMethodLabel(
  raw: string | null | undefined,
  methodIdToName: Record<string, string>
): string {
  if (raw == null || String(raw).trim() === '') return '-';
  const s = String(raw).trim();
  if (methodIdToName[s]) return methodIdToName[s];
  return s;
}

/**
 * 種類: `import_kind_text` を最優先。次に、列未作成時の退避用メモ先頭 `［種類:…］`。なければ payment_detail_id
 */
export function formatPaymentDetailLabel(
  paymentDetailId: string | null | undefined,
  detailIdToName: Record<string, string>,
  importKindText?: string | null,
  memoForKindFallback?: string | null
): string {
  if (importKindText != null && String(importKindText).trim() !== '') {
    return String(importKindText).trim();
  }
  const fromMemo = parseKindFromImportMemo(memoForKindFallback);
  if (fromMemo) return fromMemo;
  if (paymentDetailId && detailIdToName[paymentDetailId]) return detailIdToName[paymentDetailId];
  return '-';
}

export function normalizeForMasterMatch(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/\u3000/g, ' ').trim().replace(/\s+/g, '').toLowerCase();
}

/** 支払方法マスタ名から売上集計バケットへ */
export function bucketPaymentMethodByDisplayName(displayName: string): PaymentMethodBucket {
  const n = displayName.trim();
  if (!n) return 'other';
  const lower = n.toLowerCase();
  if (n === '現金' || lower === 'cash') return 'cash';
  if (n.includes('クレジット') || n === 'カード') return 'card';
  if (lower.includes('paypay')) return 'paypay';
  return 'other';
}

/** 生の payment_method 値と id→名マップからバケットへ */
export function bucketStoredPaymentMethod(
  raw: string | null | undefined,
  methodIdToName: Record<string, string>
): PaymentMethodBucket {
  const label = raw == null || String(raw).trim() === '' ? '' : formatPaymentMethodLabel(raw, methodIdToName);
  if (label === '-') return 'other';
  return bucketPaymentMethodByDisplayName(label);
}
