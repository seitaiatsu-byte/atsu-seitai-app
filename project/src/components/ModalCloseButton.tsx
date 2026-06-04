import { X } from 'lucide-react';

type Props = {
  onClick: () => void;
  className?: string;
  /** 暗いオーバーレイ上 */
  variant?: 'default' | 'onDark';
};

export default function ModalCloseButton({ onClick, className = '', variant = 'default' }: Props) {
  const tone =
    variant === 'onDark'
      ? 'border-white/40 bg-white/15 text-white hover:bg-white/25'
      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="閉じる"
      className={`inline-flex items-center justify-center gap-1.5 shrink-0 min-h-11 px-4 py-2.5 rounded-lg border text-sm font-bold shadow-sm ${tone} ${className}`}
    >
      <X size={20} strokeWidth={2.5} className="shrink-0" />
      <span>閉じる</span>
    </button>
  );
}
