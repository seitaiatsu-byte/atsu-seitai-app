import type { ReactNode } from 'react';

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
        <div className="member-site-banner-crop">
          <img
            src="/member-header-banner.png"
            alt="あつ整体院 会員専用コンテンツサイト"
            className="member-site-banner"
            width={1200}
            height={360}
          />
        </div>
        <p className="member-site-tagline">
          あなたの「健康スイッチ」が<span className="member-tagline-on">ON</span>になる部屋
        </p>
        <div className="member-site-header-fade" aria-hidden />
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
