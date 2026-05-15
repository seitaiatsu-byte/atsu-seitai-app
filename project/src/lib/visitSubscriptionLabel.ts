import { formatPaymentDetailLabel } from './paymentDisplay';

type VisitLabelFields = {
  menu_name?: string | null;
  memo?: string | null;
  import_kind_text?: string | null;
  payment_method?: string | null;
  payment_detail_id?: string | null;
};

/** 売上集計（旧ロジック）と同じく、種類・メニュー・メモ・支払を連結した文字列 */
export function visitRecordMixedLabel(v: VisitLabelFields, detailIdToName: Record<string, string>): string {
  const detailLabel = formatPaymentDetailLabel(
    v.payment_detail_id,
    detailIdToName,
    v.import_kind_text,
    v.memo
  );
  const paymentLabel = String(v.payment_method ?? '');
  return `${detailLabel} ${paymentLabel} ${v.menu_name ?? ''} ${v.memo ?? ''} ${v.import_kind_text ?? ''}`;
}

/** 旧集計でサブスク列に入っていた来院記録の判定（修正候補の洗い出し用） */
export function visitRecordHadSubscriptionLabel(mixedLabel: string): boolean {
  const s = mixedLabel.replace(/\s+/g, '').toLowerCase();
  return s.includes('サブスク') || s.includes('定期') || s.includes('subscription');
}
