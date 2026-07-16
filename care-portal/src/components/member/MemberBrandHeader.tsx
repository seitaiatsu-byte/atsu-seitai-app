import type { ReactNode } from 'react';
import MemberBrandLogo from './MemberBrandLogo';

type Props = {
  variant?: 'hero' | 'page' | 'print';
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  sticky?: boolean;
};

export default function MemberBrandHeader({
  variant = 'page',
  eyebrow,
  title,
  subtitle,
  children,
  sticky,
}: Props) {
  const isHero = variant === 'hero';

  return (
    <header className={`member-brand-header relative ${sticky ? 'sticky top-0 z-20' : ''}`}>
      <div
        className={`relative px-4 ${
          isHero ? 'py-8 sm:py-10 text-center' : variant === 'print' ? 'py-6' : 'py-5'
        }`}
      >
        <div
          className={`mx-auto max-w-lg ${
            isHero ? 'flex flex-col items-center gap-3' : 'flex items-start gap-3.5'
          }`}
        >
          <MemberBrandLogo
            size={isHero ? 'lg' : variant === 'print' ? 'md' : 'sm'}
            className={isHero ? '' : 'shrink-0'}
          />

          <div className={`min-w-0 ${isHero ? 'w-full' : 'flex-1'}`}>
            {eyebrow && <p className="member-brand-eyebrow text-xs sm:text-sm font-medium">{eyebrow}</p>}
            <h1
              className={`member-brand-title font-bold leading-tight ${
                isHero ? 'text-2xl sm:text-3xl mt-1' : variant === 'print' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'
              }`}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={`member-brand-subtitle leading-relaxed ${
                  isHero ? 'text-base sm:text-lg mt-2' : 'text-sm sm:text-base mt-1.5'
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {children && <div className="relative mt-4 max-w-lg mx-auto">{children}</div>}
      </div>
    </header>
  );
}
