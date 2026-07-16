import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

export default function MemberPageShell({ children, className = '' }: Props) {
  return (
    <div className={`member-page min-h-screen flex flex-col ${className}`}>
      <div className="member-page-bg pointer-events-none fixed inset-0 -z-10" aria-hidden />
      {children}
    </div>
  );
}
