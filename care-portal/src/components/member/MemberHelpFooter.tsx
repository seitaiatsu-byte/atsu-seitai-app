import { HelpCircle } from 'lucide-react';
import { MEMBER_HELP_BODY, MEMBER_HELP_TITLE } from '../../lib/memberGuide';

type Props = {
  large?: boolean;
};

export default function MemberHelpFooter({ large }: Props) {
  return (
    <div className={`member-help-box ${large ? 'text-base' : 'text-sm sm:text-base'}`}>
      <p className="font-bold flex items-center gap-2 member-text-emerald">
        <HelpCircle size={large ? 22 : 18} className="shrink-0" />
        {MEMBER_HELP_TITLE}
      </p>
      <p className="mt-1 leading-relaxed member-text-muted">{MEMBER_HELP_BODY}</p>
    </div>
  );
}
