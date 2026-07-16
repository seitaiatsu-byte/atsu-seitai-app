import { MEMBER_HANDOUT_ITEMS, MEMBER_HANDOUT_TITLE, MEMBER_PASSWORD_NOTE } from '../../lib/memberGuide';

export default function MemberHandoutSection() {
  return (
    <div className="member-card-soft p-4 text-base leading-relaxed">
      <p className="font-bold text-member-text mb-3">{MEMBER_HANDOUT_TITLE}</p>
      <ul className="space-y-2 member-text-muted">
        {MEMBER_HANDOUT_ITEMS.map((item) => (
          <li key={item} className="pl-1">
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-4 member-text-muted">{MEMBER_PASSWORD_NOTE}</p>
    </div>
  );
}
