import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  /** TOP画面など、戻るが不要なとき */
  hideBack?: boolean;
}

export default function PageHeader({ title, onBack, right, hideBack }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 py-3 px-1 mb-2 bg-gradient-to-b from-slate-50/95 to-transparent backdrop-blur-sm">
      {hideBack ? (
        <div className="w-[88px]" />
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-gray-700 bg-white border-2 border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
          aria-label="戻る"
        >
          <ChevronLeft size={22} />
          戻る
        </button>
      )}
      <h1 className="text-lg sm:text-xl font-bold text-gray-800 text-center flex-1 truncate px-2">{title}</h1>
      <div className="min-w-[88px] flex justify-end">{right}</div>
    </div>
  );
}
