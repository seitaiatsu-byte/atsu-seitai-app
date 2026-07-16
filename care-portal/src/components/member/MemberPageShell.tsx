import type { ReactNode } from 'react';

const WATERMARKS = [
  { className: 'member-watermark member-watermark-1' },
  { className: 'member-watermark member-watermark-2' },
  { className: 'member-watermark member-watermark-3' },
  { className: 'member-watermark member-watermark-4' },
] as const;

type Props = {
  children: ReactNode;
  className?: string;
  /** 透かしロゴを出さない（印刷プレビュー帯など） */
  noWatermark?: boolean;
};

export default function MemberPageShell({ children, className = '', noWatermark }: Props) {
  return (
    <div className={`member-page min-h-screen flex flex-col relative ${className}`}>
      <div className="member-page-bg pointer-events-none fixed inset-0 -z-20" aria-hidden />
      {!noWatermark && (
        <div className="member-watermarks pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
          {WATERMARKS.map((w) => (
            <img
              key={w.className}
              src="/clinic-logo.png"
              alt=""
              className={w.className}
            />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
