type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, { wrap: string; img: string }> = {
  sm: { wrap: 'w-[4.5rem] h-[4.5rem]', img: 'w-[3.75rem] h-[3.75rem]' },
  md: { wrap: 'w-[6.5rem] h-[6.5rem]', img: 'w-[5.5rem] h-[5.5rem]' },
  lg: { wrap: 'w-[9rem] h-[9rem]', img: 'w-[7.75rem] h-[7.75rem]' },
};

type Props = {
  size?: Size;
  className?: string;
};

export default function MemberBrandLogo({ size = 'md', className = '' }: Props) {
  const s = SIZE[size];

  return (
    <div className={`member-brand-logo relative inline-flex items-center justify-center ${s.wrap} ${className}`}>
      <span className="member-brand-logo-halo absolute inset-0 rounded-full" aria-hidden />
      <span className="member-brand-logo-ring absolute inset-[6%] rounded-full" aria-hidden />
      <span className="member-brand-logo-plate relative rounded-full p-[3px]" aria-hidden />
      <img
        src="/clinic-logo.png"
        alt="a2 ReCONDITIONING STATION"
        className={`${s.img} relative rounded-full object-cover member-brand-logo-img`}
        width={124}
        height={124}
      />
    </div>
  );
}
