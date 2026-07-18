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
        <div className="member-site-banner" role="img" aria-label="あつ整体院 会員専用コンテンツサイト あなたの健康スイッチがONになる部屋">
          <div className="member-site-banner-watermarks" aria-hidden>
            <img src="/clinic-logo.png" alt="" className="member-site-banner-wm member-site-banner-wm-a" />
            <img src="/clinic-logo.png" alt="" className="member-site-banner-wm member-site-banner-wm-b" />
          </div>

          <div className="member-site-banner-inner">
            <div className="member-site-banner-brand">
              <img
                src="/clinic-logo.png"
                alt="a2 Re CONDITIONING STATION"
                className="member-site-banner-logo"
                width={112}
                height={112}
              />
              <p className="member-site-banner-clinic">あつ整体院</p>
            </div>

            <div className="member-site-banner-titles">
              <p className="member-site-banner-title">会員専用</p>
              <p className="member-site-banner-title">コンテンツサイト</p>
            </div>
          </div>

          <p className="member-site-banner-tagline">
            あなたの“健康スイッチ”が<span className="member-site-banner-on">ON</span>になる部屋
          </p>
        </div>
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
