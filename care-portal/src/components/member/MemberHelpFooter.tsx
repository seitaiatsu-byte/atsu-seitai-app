import { Phone } from 'lucide-react';
import { CLINIC_HELP_LINE } from '../../lib/memberGuide';

type Props = {
  large?: boolean;
};

export default function MemberHelpFooter({ large }: Props) {
  return (
    <div className={`member-help-box ${large ? 'text-base' : 'text-sm sm:text-base'}`}>
      <p className="font-bold flex items-center gap-2 member-text-emerald">
        <Phone size={large ? 22 : 18} className="shrink-0" />
        わからないときは
      </p>
      <p className="mt-1 leading-relaxed member-text-muted">{CLINIC_HELP_LINE}</p>
    </div>
  );
}
