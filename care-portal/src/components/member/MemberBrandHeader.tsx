import type { ReactNode } from 'react';

type Props = {
  /** バナー下の補足（入室・動画ページ用） */
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  sticky?: boolean;
};

function BannerTitle() {
  return (
    <svg
      className="member-site-banner-title-svg"
      viewBox="0 0 520 168"
      role="img"
      aria-label="会員専用コンテンツサイト"
    >
      <defs>
        <filter id="banner-title-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodColor="#1a1510" floodOpacity="0.35" />
        </filter>
      </defs>
      <g
        fill="#ffffff"
        stroke="#1c1610"
        strokeWidth="6.5"
        strokeLinejoin="round"
        paintOrder="stroke fill"
        filter="url(#banner-title-soft)"
        fontFamily="'Zen Kaku Gothic New', 'Hiragino Sans', 'Noto Sans JP', sans-serif"
        fontWeight="900"
        fontSize="72"
      >
        <text x="8" y="72">
          会員専用
        </text>
        <text x="8" y="148">
          コンテンツサイト
        </text>
      </g>
    </svg>
  );
}

export default function MemberBrandHeader({ title, subtitle, children, sticky }: Props) {
  const hasSub = Boolean(title || subtitle || children);

  return (
    <header className={`member-site-header ${sticky ? 'sticky top-0 z-20' : ''}`}>
      <div className="member-site-banner-wrap">
        <div
          className="member-site-banner"
          role="img"
          aria-label="あつ整体院 会員専用コンテンツサイト あなたの健康スイッチがONになる部屋"
        >
          <div className="member-site-banner-watermarks" aria-hidden>
            <span className="member-site-banner-wm member-site-banner-wm-a">
              <img src="/clinic-logo.png" alt="" />
            </span>
            <span className="member-site-banner-wm member-site-banner-wm-b">
              <img src="/clinic-logo.png" alt="" />
            </span>
          </div>

          <div className="member-site-banner-inner">
            <div className="member-site-banner-brand">
              <span className="member-site-banner-logo-wrap">
                <img
                  src="/clinic-logo.png"
                  alt="a2 Re CONDITIONING STATION"
                  className="member-site-banner-logo"
                  width={160}
                  height={160}
                />
              </span>
              <p className="member-site-banner-clinic">あつ整体院</p>
            </div>

            <div className="member-site-banner-titles">
              <BannerTitle />
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
