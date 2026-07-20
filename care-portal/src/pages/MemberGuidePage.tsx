import { ArrowLeft, Printer } from 'lucide-react';
import MemberRoomQrCard from '../components/admin/MemberRoomQrCard';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberPrintHeader from '../components/member/MemberPrintHeader';
import MemberStepGuide from '../components/member/MemberStepGuide';
import MemberStepIllustrations, { MemberJourneyMap } from '../components/member/MemberStepIllustrations';
import { buildMemberRoomUrl } from '../lib/siteConfig';
import { MEMBER_GUIDE_STEPS, MEMBER_HANDOUT_ITEMS, MEMBER_MANUAL_PURPOSE } from '../lib/memberGuide';

type Props = {
  memberName?: string;
  roomCode?: string;
  roomUrl?: string;
};

export default function MemberGuidePage({ memberName, roomCode, roomUrl }: Props) {
  const displayUrl = roomUrl || (roomCode ? buildMemberRoomUrl(roomCode) : '（スタッフがお渡しするリンク）');
  const displayName = memberName?.trim() || '＿＿＿＿＿＿ さん';

  return (
    <MemberPageShell className="member-manual-a4 member-guide-print" noWatermark>
      <div className="no-print sticky top-0 z-30 border-b border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-950">{MEMBER_MANUAL_PURPOSE.staffBanner}</p>
          <p className="text-xs text-amber-800 mt-0.5">対象：{displayName} — 印刷して渡してください</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => window.print()} className="member-btn-primary flex items-center gap-2 px-4 py-2 text-sm">
            <Printer size={18} />
            印刷する
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-1 border border-slate-300 bg-white hover:bg-slate-50 font-bold px-3 py-2 rounded-lg text-xs text-slate-700"
          >
            <ArrowLeft size={14} />
            戻る
          </a>
        </div>
      </div>

      <article className="max-w-[210mm] mx-auto p-6 sm:p-10 print:p-8 manual-a4-content">
        <MemberPrintHeader subtitle={`対象：${displayName}`} />

        <section className="mb-8 member-card p-5 sm:p-6 manual-a4-section">
          <div className="space-y-4 text-lg leading-relaxed">
            <div>
              <p className="font-bold member-text-emerald">① あなた専用のページアドレス（またはQRコード）</p>
              {roomCode ? (
                <div className="mt-3">
                  <MemberRoomQrCard memberName={displayName.replace(/ さん$/, '')} roomCode={roomCode} compact />
                </div>
              ) : (
                <>
                  <p className="mt-2 break-all font-mono text-base sm:text-lg member-card-soft p-3">{displayUrl}</p>
                  <p className="text-base member-text-muted mt-2">
                    スマホでは青くなっている文字をタップ。パソコンではクリック。
                  </p>
                </>
              )}
            </div>
            <div>
              <p className="font-bold member-text-emerald">{MEMBER_HANDOUT_ITEMS[1]}</p>
              <p className="mt-2 text-2xl font-bold tracking-widest border-b-2 border-member-gold-soft inline-block min-w-[8rem] pb-1">
                ＿＿＿＿＿＿
              </p>
              <p className="text-base member-text-muted mt-2">※LINE・来院時などでお渡しします。ここに書き写しても構いません。</p>
            </div>
          </div>
        </section>

        <section className="mb-8 manual-a4-section">
          <MemberJourneyMap />
        </section>

        <section className="mb-8 manual-a4-section">
          <MemberStepIllustrations />
        </section>

        <section className="mb-8 manual-a4-section">
          <h2 className="text-xl font-bold text-member-gold-deep mb-4">操作の手順（3ステップ）</h2>
          <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        </section>

        <div className="mb-8 manual-a4-section">
          <MemberHandoutSection />
        </div>

        <div className="manual-a4-section">
          <MemberHelpFooter large />
        </div>

        <footer className="text-center text-sm member-text-muted pt-6 mt-8 border-t border-member-gold-soft/40">
          あつ整体院
        </footer>
      </article>
    </MemberPageShell>
  );
}
