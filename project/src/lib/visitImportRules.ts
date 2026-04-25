/**
 * 来院 CSV インポート: 5列目（支払方法）のマスタ解決のみ。6列目（種類）は import_kind_text に生保存のため本ファイルでは扱わない。
 */
export function normalizeCellText(raw: string): string {
  return raw.replace(/\u3000/g, ' ').trim();
}

/**
 * 5列目（支払方法）: DB 照合用に正規化する**補助名**
 * - 「カード」単独 →「クレジットカード」
 */
export function normalizeVisitImportPaymentMethodForMaster(raw: string): string {
  const t = normalizeCellText(raw);
  if (t === 'カード') return 'クレジットカード';
  return t;
}

function isCreditMethodLabelInMaster(name: string | null | undefined): boolean {
  const n = normalizeCellText(name ?? '');
  if (!n) return false;
  return n === 'クレジットカード' || n === 'カード' || n === 'クレカ' || n === 'CREDIT' || n === 'CARD' || n === 'card';
}

/**
 * 来院 CSV の支払方法: `payment_method_master` の行を1件に決める
 */
export function resolvePaymentMethodMasterIdForVisitImport(
  raw: string,
  rows: { id: string; name: string | null }[] | null | undefined
): { id: string; matchedName: string } | null {
  const list = rows || [];
  const t0 = normalizeCellText(raw);
  if (!t0) return null;
  const normalized = normalizeVisitImportPaymentMethodForMaster(raw);

  const tryExact = (q: string): { id: string; matchedName: string } | null => {
    const t = normalizeCellText(q);
    if (!t) return null;
    for (const r of list) {
      if (!r.id) continue;
      const rn = normalizeCellText(r.name ?? '');
      if (rn === t) return { id: r.id, matchedName: r.name ?? '' };
    }
    return null;
  };

  const a = tryExact(normalized);
  if (a) return a;

  if (t0 !== normalized) {
    const b = tryExact(t0);
    if (b) return b;
  }

  const userWantsCredit =
    t0 === 'カード' ||
    t0 === 'クレジットカード' ||
    t0 === 'クレカ' ||
    t0 === 'CREDIT' ||
    t0 === 'card' ||
    t0 === 'CARD' ||
    normalized === 'クレジットカード';
  if (userWantsCredit) {
    for (const r of list) {
      if (!r.id) continue;
      if (isCreditMethodLabelInMaster(r.name)) {
        return { id: r.id, matchedName: r.name ?? '' };
      }
    }
  }

  return null;
}
