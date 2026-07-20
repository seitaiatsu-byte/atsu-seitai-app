import { CLINIC_DISPLAY_NAME } from '../../lib/studyRoom';

type Props = {
  title?: string;
  subtitle?: string;
};

/** 印刷用フライヤーのヘッダー（バナーなし・部屋ページと区別） */
export default function MemberPrintHeader({ title = CLINIC_DISPLAY_NAME, subtitle }: Props) {
  return (
    <header className="member-print-header border-b border-member-gold-soft/40 pb-4 mb-4">
      <h1 className="text-center text-xl sm:text-2xl font-bold text-member-gold-deep leading-tight">{title}</h1>
      {subtitle && (
        <p className="text-center text-sm sm:text-base member-text-muted mt-2 leading-relaxed px-2">{subtitle}</p>
      )}
      <p className="text-center text-xs member-text-muted mt-2 print:text-[10px]">
        取扱説明書（印刷用）— 動画を見る部屋ではありません
      </p>
    </header>
  );
}
