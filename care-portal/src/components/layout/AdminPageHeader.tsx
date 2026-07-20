import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type Props = {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  tone?: '700' | '800';
};

export default function AdminPageHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'ルーム一覧へ',
  right,
  tone = '700',
}: Props) {
  const bg = tone === '800' ? 'bg-indigo-800' : 'bg-indigo-700';

  return (
    <header className={`app-page-header ${bg} text-white pb-3`}>
      {onBack ? (
        <button type="button" onClick={onBack} className="app-nav-back text-sm text-indigo-200 mb-1">
          <ArrowLeft size={18} aria-hidden />
          {backLabel}
        </button>
      ) : null}
      <div className={right ? 'flex items-start justify-between gap-3' : undefined}>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold text-lg leading-snug">{title}</h1>
          {subtitle ? <div className="text-xs text-indigo-200 mt-1">{subtitle}</div> : null}
        </div>
        {right}
      </div>
    </header>
  );
}
