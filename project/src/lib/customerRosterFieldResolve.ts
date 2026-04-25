import type { Database } from './database.types';

type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerRowRecord = Customer & Record<string, unknown>;

/** ダミー枠（ー/---/未入力 等）を非表示。customerDisplayFields.textForDisplay と同等。 */
function displayString(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/\u00a0/g, ' ').trim();
  if (t === '') return null;
  if (t === '...' || t === '…' || t === '---' || t === '--' || t === '－' || t === 'ー' || t === 'ｰ') {
    return null;
  }
  if (t === 'n/a' || t === 'N/A' || t === 'なし' || t === '同上' || t === '未入力' || t === '未登録' || t === '空' || t === '無') {
    return null;
  }
  if (/^[-ー－ｰ―‐\s0.・。]+$/u.test(t) && t.length < 2) return null;
  return t;
}

/** 先頭の非空キー（表や外部DBで列名が違う場合用） */
export function firstStringFromRow(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).replace(/\u00a0/g, ' ').trim();
    if (s !== '') return s;
  }
  return null;
}

/** ふりがな: かなを含めば「ー」だけ行より実データ扱い */
function kanaTextForDisplay(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).replace(/\u00a0/g, ' ').trim();
  if (t === '') return null;
  if (/[\u30A0-\u30FF\u3040-\u309F]/.test(t) || /[ぁ-んァ-ヶ]/.test(t)) return t;
  return displayString(t);
}

export function getKanaForRoster(c: CustomerRowRecord): string | null {
  const s = firstStringFromRow(c, [
    'name_kana',
    'kana',
    'Kana',
    'nameKana',
    'KANA',
    'furigana',
    'フリガナ',
  ]);
  return s ? kanaTextForDisplay(s) : null;
}

/** 流入（メイン）: main_source を優先 */
export function getMainInflow1ForRoster(c: CustomerRowRecord): string | null {
  const s = firstStringFromRow(c, [
    'main_source',
    'MainSource',
    'referral_source',
    'acquisition',
    'acquisition_source',
    'inflow',
    'source',
  ]);
  return s ? displayString(s) : null;
}

export function getMainInflow2ForRoster(c: CustomerRowRecord): string | null {
  const s = firstStringFromRow(c, ['referral_source_2', 'sub_source', 'inflow2', 'main_source_2']);
  return s ? displayString(s) : null;
}

export function getInflowLineFromRoster(c: CustomerRowRecord): string | null {
  const a = getMainInflow1ForRoster(c);
  const b = getMainInflow2ForRoster(c);
  if (a || b) {
    return [a, b].filter((x): x is string => Boolean(x && x.trim())).join(' / ') || null;
  }
  return null;
}

export function getMemoForRoster(c: CustomerRowRecord): string | null {
  const s = firstStringFromRow(c, ['memo', 'note', 'remarks', 'comment', 'Comment', '備考']);
  if (!s) return null;
  return displayString(s) ?? s;
}

function complaint1Raw(c: CustomerRowRecord): string | null {
  return firstStringFromRow(c, [
    'chief_complaint_1',
    'complaint_1',
    'complaint1',
    'Complaint1',
    '主訴1',
    'chief_complaint',
  ]);
}

export function getComplaint1ForRoster(c: CustomerRowRecord): string | null {
  const s = complaint1Raw(c);
  return s ? displayString(s) : null;
}

export function getComplaint2ForRoster(c: CustomerRowRecord): string | null {
  const s = firstStringFromRow(c, [
    'chief_complaint_2',
    'complaint_2',
    'complaint2',
    'Complaint2',
  ]);
  return s ? displayString(s) : null;
}

export function getComplaint3ForRoster(c: CustomerRowRecord): string | null {
  const s = firstStringFromRow(c, [
    'chief_complaint_3',
    'complaint_3',
    'complaint3',
    'Complaint3',
  ]);
  return s ? displayString(s) : null;
}
