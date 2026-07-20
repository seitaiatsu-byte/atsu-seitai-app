import type { ReactNode } from 'react';
import { CLINIC_DISPLAY_NAME } from '../../lib/studyRoom';

/** 書き出し実寸（枠はみ出し防止のため HTML 寸法も一致させる） */
const BANNER_WIDTH = 2000;
const BANNER_HEIGHT = 668;

type Props = {
  /** バナー下の補足（入室・動画ページ用） */
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  sticky?: boolean;
};

export default function MemberBrandHeader({ title, subtitle, children, sticky }: Props) {
  const hasSub = Boolean(title || subtitle || children);

  return (
    <header className={`member-site-header ${sticky ? 'sticky top-0 z-20' : ''}`}>
      <div className="member-site-banner-wrap">
        <img
          src="/member-header-banner.png"
          alt={CLINIC_DISPLAY_NAME}
          className="member-site-banner"
          width={BANNER_WIDTH}
          height={BANNER_HEIGHT}
        />
      </div>

      {hasSub && (
        <div className="member-site-subheader">
          <div className="max-w-lg mx-auto px-4 py-4">
            {title && <h1 className="member-brand-title font-bold text-lg sm:text-xl leading-tight">{title}</h1>}
            {subtitle && <p className="member-brand-subtitle text-sm sm:text-base mt-1.5 leading-relaxed">{subtitle}</p>}
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
      )}
    </header>
  );
}
