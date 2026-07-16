import { Printer, Shield } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import MemberStepIllustrations, { MemberJourneyMap } from '../components/member/MemberStepIllustrations';
import { MEMBER_GUIDE_STEPS } from '../lib/memberGuide';

/** 会員向け・印刷して渡す取扱説明書（フライヤー） */
export default function MemberManualPage() {
  return (
    <MemberPageShell className="member-manual-flyer member-guide-print" noWatermark>
      <MemberBrandHeader />

      <div className="no-print sticky top-0 z-30 border-b border-member-gold-soft/50 bg-member-camel-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-member-gold-deep">会員向け取扱説明書（印刷してお渡しできます）</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="member-btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0"
        >
          <Printer size={18} />
          印刷する
        </button>
      </div>

      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-5 pb-8">
        <section className="member-panel p-4 sm:p-5 text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-member-gold-deep">セルフケア動画の見方</h1>
          <p className="text-base member-text-muted mt-2 leading-relaxed">
            お渡しした<strong>専用リンク</strong>または<strong>QRコード</strong>からご利用ください。
          </p>
        </section>

        <MemberJourneyMap />
        <MemberStepIllustrations />

        <section>
          <h2 className="text-base font-bold text-member-gold-deep mb-3 px-1">くわしい説明（文字）</h2>
          <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        </section>

        <MemberHandoutSection />
        <MemberHelpFooter large />

        <footer className="text-center text-xs member-text-muted pt-4 border-t border-member-gold-soft/40 print:block">
          あつ整体院 会員専用セルフケア動画
        </footer>
      </main>

      <footer className="no-print p-4 text-center">
        <a href="/admin/manual" className="member-link-subtle text-xs inline-flex items-center gap-1">
          <Shield size={14} />
          スタッフ用マニュアル
        </a>
      </footer>
    </MemberPageShell>
  );
}
