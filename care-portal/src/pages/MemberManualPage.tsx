import { BookOpen, Home } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import ManualFlowTimeline from '../components/member/ManualFlowTimeline';
import {
  MEMBER_ENTRY_EXPLAIN,
  MEMBER_FULL_FLOW,
  MEMBER_GUIDE_STEPS,
  MEMBER_SITE_PURPOSE,
} from '../lib/memberGuide';

type Props = {
  onGoHome: () => void;
};

export default function MemberManualPage({ onGoHome }: Props) {
  return (
    <MemberPageShell>
      <MemberBrandHeader
        title="会員さん向け・くわしい使い方マニュアル"
        subtitle="家電の取扱説明書のように、順番どおりに読んでください"
      />

      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-5 pb-8">
        <section className="member-card p-5 sm:p-6 space-y-3">
          <h2 className="text-lg font-bold text-member-gold-deep flex items-center gap-2">
            <BookOpen size={22} />
            {MEMBER_SITE_PURPOSE.title}
          </h2>
          <p className="text-base leading-relaxed member-text-muted">{MEMBER_SITE_PURPOSE.body}</p>
        </section>

        <section className="member-panel p-5 sm:p-6 border-member-teal/25 space-y-3">
          <h2 className="text-lg font-bold text-member-gold-deep">{MEMBER_ENTRY_EXPLAIN.title}</h2>
          <ul className="space-y-3 text-base leading-relaxed member-text-muted list-none">
            {MEMBER_ENTRY_EXPLAIN.points.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="text-member-teal font-bold shrink-0">●</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        <ManualFlowTimeline title="全体の流れ（だれが・いつ・どこで）" steps={MEMBER_FULL_FLOW} />

        <section>
          <h2 className="text-lg font-bold text-member-gold-deep mb-3 px-1">操作の手順（3ステップ・くわしく）</h2>
          <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        </section>

        <MemberHandoutSection />
        <MemberHelpFooter large />

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button type="button" onClick={onGoHome} className="member-btn-secondary flex items-center justify-center gap-2 py-3 px-4">
            <Home size={18} />
            トップへ戻る
          </button>
        </div>
      </main>
    </MemberPageShell>
  );
}
