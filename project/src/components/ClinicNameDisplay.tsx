import type { Database } from '../lib/database.types';
import { getClinicNameForDisplay } from '../lib/customerDisplayFields';
import { CLINIC_SHORT_LABEL, type ClinicFullName } from '../lib/clinic';

type Customer = Database['public']['Tables']['customers']['Row'];

type Props = {
  /** DB・補完後の院名のいずれか。空なら中身表示なし */
  rawClinicName: string | null | undefined;
  /** raw が空のとき */
  emptyLabel?: string;
};

/**
 * 高槻・川西の表記をアプリ内で統一: 高槻院＝青、川西＝オレンジ（DB 値は「〜あつ整体院」のまま可）
 */
export function ClinicNameDisplay({ rawClinicName, emptyLabel = '—' }: Props) {
  const v = (rawClinicName || '').trim();
  if (!v) return <span className="text-gray-400">{emptyLabel}</span>;
  if (v.includes('高槻')) {
    return <span className="font-bold text-blue-600">{CLINIC_SHORT_LABEL.takatsuki}</span>;
  }
  if (v.includes('川西')) {
    return <span className="font-bold text-orange-600">{CLINIC_SHORT_LABEL.kawanishi}</span>;
  }
  return <span className="text-gray-700">{v}</span>;
}

type FromCustomerProps = {
  customer: Customer;
  emptyLabel?: string;
};

/**
 * `clinic_name` が空のとき顧客番号から補完（getClinicNameForDisplay）のうえ、短縮色付き表記
 */
export function ClinicNameFromCustomer({ customer, emptyLabel = '院未設定' }: FromCustomerProps) {
  const r: ClinicFullName | null = getClinicNameForDisplay(customer);
  return <ClinicNameDisplay rawClinicName={r} emptyLabel={emptyLabel} />;
}

/** 来院レコード用（補完なし・生の clinic_name） */
export function ClinicNameFromVisitClinicName({
  clinicName,
  emptyLabel = '—',
}: {
  clinicName: string | null | undefined;
  emptyLabel?: string;
}) {
  return <ClinicNameDisplay rawClinicName={clinicName} emptyLabel={emptyLabel} />;
}
