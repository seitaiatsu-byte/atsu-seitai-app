type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, string> = {
  sm: 'w-14 h-14',
  md: 'w-20 h-20',
  lg: 'w-28 h-28',
};

type Props = {
  size?: Size;
  className?: string;
};

export default function MemberBrandLogo({ size = 'md', className = '' }: Props) {
  return (
    <img
      src="/clinic-logo.png"
      alt="a2 ReCONDITIONING STATION"
      className={`member-brand-logo-img ${SIZE[size]} rounded-full object-cover ${className}`}
      width={112}
      height={112}
    />
  );
}
