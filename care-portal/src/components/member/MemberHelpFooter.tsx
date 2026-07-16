import { Phone } from 'lucide-react';
import { CLINIC_HELP_LINE } from '../../lib/memberGuide';

type Props = {
  large?: boolean;
};

export default function MemberHelpFooter({ large }: Props) {
  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 text-amber-950 ${
        large ? 'px-4 py-4 text-base' : 'px-3 py-3 text-sm sm:text-base'
      }`}
    >
      <p className="font-bold flex items-center gap-2">
        <Phone size={large ? 22 : 18} className="shrink-0" />
        わからないときは
      </p>
      <p className="mt-1 leading-relaxed">{CLINIC_HELP_LINE}</p>
    </div>
  );
}
