/**
 * 名簿 CSV 用: 全角英数字の電話等を半角化してから数字だけ残す（全角だけの番号が空になる不具合を防ぐ）
 */
export function normalizePhoneDigitsForDb(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const digits = normalized.replace(/\D/g, '');
  return digits || null;
}

const NFKC = (s: string) => (typeof s.normalize === 'function' ? s.normalize('NFKC') : s);

/** 見出し行の揺れ（全角英字・BOM）を揃えて比較用にする */
export function normalizeCsvHeaderLabel(raw: string): string {
  return NFKC(raw)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

type ColumnSpec = { key: string; labels: string[] };

const COLUMN_SPECS: ColumnSpec[] = [
  { key: 'customer_number', labels: ['顧客番号', 'customer_number', '患者番号', '会員番号', '会員Ｎｏ', '会員no'] },
  { key: 'name', labels: ['name', '氏名', '名前', '患者名', '顧客名', '顧客氏名'] },
  {
    key: 'name_kana',
    labels: ['name_kana', 'かな', 'ふりがな', 'フリガナ', 'カナ', '顧客カナ', '氏名カナ'],
  },
  { key: 'gender', labels: ['gender', '性別'] },
  { key: 'birth_date', labels: ['birth_date', '生年月日', '誕生日', '生年月日 ', ' 生年月日', 'dob', '生年'] },
  {
    key: 'phone',
    labels: [
      'phone',
      'phone_number',
      'tel',
      'tels',
      '電話',
      '電話番号',
      '携帯',
      '携帯電話',
      'ﾓﾊﾞｲﾙ',
      'ｔｅｌ',
      '連絡先',
    ],
  },
  { key: 'referral_1', labels: ['referral_source', '流入のメイン', '流入メイン', '流入経路', '流入', '紹介', '紹介元', '流入元', '獲得経路', 'acquisition', 'acquisition source'] },
  { key: 'referral_2', labels: ['referral_source_2', '流入のサブ', '流入サブ', '流入経路2', '紹介2', '紹介元2'] },
  { key: 'referral_3', labels: ['referral_source_3', '流入のサブ2', '流入サブ2', '流入経路3', '紹介3', '紹介元3'] },
  { key: 'prefecture', labels: ['prefecture', '都道府県', '府県', '都府県'] },
  { key: 'city', labels: ['city', '市', '市・郡', '市区', '市区町村', '自治体'] },
  { key: 'town', labels: ['town', '町', '町名', '丁目', '番地以降'] },
  { key: 'complaint1', labels: ['chief_complaint_1', '主訴1', '主訴１', '主訴(1)'] },
  { key: 'complaint2', labels: ['chief_complaint_2', '主訴2', '主訴２', '主訴(2)'] },
  { key: 'complaint3', labels: ['chief_complaint_3', '主訴3', '主訴３', '主訴(3)'] },
  { key: 'complaint_solo', labels: ['chief_complaint', '主訴', '所見', '主な訴え'] },
  { key: 'email', labels: ['email', 'e-mail', 'email_address', 'メール', 'メールアドレス', 'eメール'] },
  { key: 'memo', labels: ['memo', 'メモ', '備考', 'コメント', '特記事項', '特記', '注記', '特記/備考'] },
];

/**
 * 1行目（見出し）から各列の 0 始まりインデックス（未検出は -1）
 */
export function resolveCsvColumnMap(normalizedHeaders: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of COLUMN_SPECS) {
    const labelsNorm = spec.labels.map((l) => normalizeCsvHeaderLabel(l));
    let best = -1;
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const nh = normalizedHeaders[i];
      if (nh == null) continue;
      if (labelsNorm.includes(nh)) {
        best = i;
        break;
      }
    }
    out[spec.key] = best;
  }
  return out;
}
