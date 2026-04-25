type PaymentLikeRow = {
  id: string;
  name: string;
  display_order?: number | null;
};

const sortRows = <T extends PaymentLikeRow>(rows: T[]) =>
  [...rows].sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));

/**
 * 以前はキーワードで「マスタが入れ替わっている」と推測して行を交換していたが、
 * 誤検知で表示と保存が逆転する原因になるため、常にテーブル定義どおり返す。
 */
export function resolvePaymentMasterSets<T extends PaymentLikeRow>(
  methodRows: T[],
  detailRows: T[]
): { methods: T[]; details: T[] } {
  return { methods: sortRows(methodRows || []), details: sortRows(detailRows || []) };
}
