/**
 * 来院記録 CSV（11 列・A〜K 固定番号）
 * 取り込みはヘッダー名ではなく 0 始まり列インデックス `COL` のみで行う（1 行目は下記行数分スキップし参照しない）
 */

// ===== F列(種類) → import_kind_text 生文字。E列(支払): マスタ解決。 =====

/** A列(日付): 仕様。`2026/4/23` または `2026-04-23`。UTC変換はせず、書いた日付のまま保存。 */
export const VISIT_CSV_DATE_RECOMMEND = '2026/4/23';

/** 表示用: F列は free text → DB import_kind_text */
export const VISIT_CSV_KIND_RECOMMEND = ['事前精算', '当日精算', '事前精算＋当日精算'] as const;

/**
 * E列(支払方法): `resolvePaymentMethodMasterIdForVisitImport` で正規化＋マスタ実名（カード/クレジットカード併用）解決
 */
export const VISIT_CSV_PAYMENT_RECOMMEND = ['クレジットカード', '現金', 'PayPay', 'その他'] as const;

export const VISIT_CSV_HEADER_LINE = [
  '日付',
  '顧客',
  '氏名',
  '売上金額',
  '支払方法',
  '種類',
  '実施メニュー',
  '通院count',
  '実質BE回数',
  '回数券count',
  'メモ',
].join(',');

export const VISIT_CSV_DATA_START_ROW_1_BASED = 2;

/**
 * 物理列（0 = A, 1 = B, … 10 = K）→ DB / アプリ欄
 * 2列目（B/idx 1）: 顧客の特定（顧客番号の数字 または 顧客の UUID）
 */
export const COL = {
  visit_date: 0, // A
  customer: 1, // B
  import_customer_name: 2, // C
  amount: 3, // D
  payment_method: 4, // E
  kind: 5, // F 「種類」 → import_kind_text（生文字。マスタ非参照）
  menu_name: 6, // G 「実施メニュー」
  import_csv_visit_count: 7, // H
  be_equivalent_count: 8, // I
  import_ticket_count_raw: 9, // J
  memo: 10, // K
} as const;

/**
 * 従来コード互換: `COL` と同じ。`kind`＝F列 種類（旧 `paymentDetail`）、`customer`＝B列（旧 `customerNo`）。
 */
export const idx = {
  date: COL.visit_date,
  customer: COL.customer,
  customerNo: COL.customer,
  name: COL.import_customer_name,
  amount: COL.amount,
  paymentMethod: COL.payment_method,
  kind: COL.kind,
  /** @deprecated 別名: `kind`（F=種類） */
  paymentDetail: COL.kind,
  menu: COL.menu_name,
  csvVisitCount: COL.import_csv_visit_count,
  beCount: COL.be_equivalent_count,
  ticket: COL.import_ticket_count_raw,
  memo: COL.memo,
} as const;
