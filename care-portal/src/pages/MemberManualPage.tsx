import { ArrowLeft, Printer, Shield } from 'lucide-react';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberPrintHeader from '../components/member/MemberPrintHeader';
import MemberStepGuide from '../components/member/MemberStepGuide';
import MemberStepIllustrations, { MemberJourneyMap } from '../components/member/MemberStepIllustrations';
import { MEMBER_GUIDE_STEPS, MEMBER_MANUAL_PURPOSE } from '../lib/memberGuide';

/** 会員向け・A4印刷して渡す取扱説明書（スマホで見せる用ではない） */
export default function MemberManualPage() {
  return (
    <MemberPageShell className="member-manual-flyer member-manual-a4 member-guide-print" noWatermark>
      <div className="no-print sticky top-0 z-30 border-b border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm font-bold text-amber-950">{MEMBER_MANUAL_PURPOSE.staffBanner}</p>
        <p className="text-xs text-amber-800 mt-1 leading-relaxed">{MEMBER_MANUAL_PURPOSE.staffDetail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="member-btn-primary flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Printer size={16} />
            A4で印刷・PDF保存
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-1 border border-slate-300 bg-white hover:bg-slate-50 font-bold px-3 py-2 rounded-lg text-xs text-slate-700"
          >
            <ArrowLeft size={14} />
            スタッフガイドへ
          </a>
        </div>
      </div>

      <main className="flex-1 p-4 sm:p-6 max-w-[210mm] mx-auto w-full space-y-5 pb-8 manual-a4-content">
        <MemberPrintHeader subtitle="お渡しした専用リンクまたはQRコードからご利用ください。" />

        <section className="manual-a4-section">
          <MemberJourneyMap />
        </section>
        <section className="manual-a4-section">
          <MemberStepIllustrations />
        </section>

        <section className="manual-a4-section">
          <h2 className="text-base font-bold text-member-gold-deep mb-3 px-1">くわしい説明（文字）</h2>
          <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        </section>

        <div className="manual-a4-section">
          <MemberHandoutSection />
        </div>
        <div className="manual-a4-section">
          <MemberHelpFooter large />
        </div>

        <footer className="text-center text-xs member-text-muted pt-4 border-t border-member-gold-soft/40 print:block manual-a4-section">
          あつ整体院 会員専用セルフケア動画
        </footer>
      </main>

      <footer className="no-print p-4 text-center border-t border-member-gold-soft/30 bg-member-camel-card/50">
        <p className="text-xs member-text-muted mb-2">{MEMBER_MANUAL_PURPOSE.memberWarning}</p>
        <a href="/" className="member-link-subtle text-xs inline-flex items-center gap-1 mr-4">
          受付スタッフ向けガイド
        </a>
        <a href="/admin/manual" className="member-link-subtle text-xs inline-flex items-center gap-1">
          <Shield size={14} />
          スタッフ用マニュアル
        </a>
      </footer>
    </MemberPageShell>
  );
}
