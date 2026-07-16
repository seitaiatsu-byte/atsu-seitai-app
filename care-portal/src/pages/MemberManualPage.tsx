import { useState } from 'react';
import { Check, ClipboardCopy, Printer, Share2, Shield, Smartphone } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import MemberStepIllustrations, { MemberJourneyMap } from '../components/member/MemberStepIllustrations';
import { MEMBER_GUIDE_STEPS, MEMBER_MANUAL_PATH } from '../lib/memberGuide';

function ManualDeliveryToolbar() {
  const [copied, setCopied] = useState(false);
  const manualUrl = typeof window !== 'undefined' ? `${window.location.origin}${MEMBER_MANUAL_PATH}` : MEMBER_MANUAL_PATH;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(manualUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('コピーに失敗しました');
    }
  };

  const shareUrl = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'セルフケア動画の見方',
          text: 'あつ整体院 会員向け取扱説明書',
          url: manualUrl,
        });
        return;
      } catch {
        /* キャンセル時はコピーにフォールバック */
      }
    }
    void copyUrl();
  };

  const savePdf = () => {
    window.print();
  };

  return (
    <div className="no-print sticky top-0 z-30 border-b border-member-gold-soft/50 bg-member-camel-card/95 backdrop-blur px-4 py-3 space-y-3">
      <p className="text-sm font-bold text-member-gold-deep">会員向け取扱説明書 — 渡し方を2通り選べます</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-member-gold-soft/50 bg-white/80 p-3">
          <p className="text-xs font-bold text-member-gold-deep flex items-center gap-1">
            <Printer size={14} />
            ① A4で印刷・PDF化
          </p>
          <p className="text-xs member-text-muted mt-1 leading-relaxed">
            印刷ダイアログで「PDFに保存」を選ぶとA4のPDFファイルになります。
          </p>
          <button
            type="button"
            onClick={savePdf}
            className="member-btn-primary mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm"
          >
            <Printer size={16} />
            A4 PDFとして保存
          </button>
        </div>
        <div className="rounded-xl border border-member-teal/30 bg-white/80 p-3">
          <p className="text-xs font-bold text-member-teal flex items-center gap-1">
            <Smartphone size={14} />
            ② スマホで見るURL
          </p>
          <p className="text-[11px] font-mono break-all member-text-muted mt-1 bg-member-camel-card/60 rounded px-2 py-1">
            {manualUrl}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="member-btn-secondary flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs"
            >
              {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
              {copied ? 'コピー済' : 'URLコピー'}
            </button>
            <button
              type="button"
              onClick={() => void shareUrl()}
              className="member-btn-primary flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs"
            >
              <Share2 size={14} />
              共有
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 会員向け・印刷して渡す取扱説明書（フライヤー） */
export default function MemberManualPage() {
  return (
    <MemberPageShell className="member-manual-flyer member-manual-a4 member-guide-print" noWatermark>
      <MemberBrandHeader />
      <ManualDeliveryToolbar />

      <main className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-5 pb-8 manual-a4-content">
        <section className="member-panel p-4 sm:p-5 text-center manual-a4-section">
          <h1 className="text-xl sm:text-2xl font-bold text-member-gold-deep">セルフケア動画の見方</h1>
          <p className="text-base member-text-muted mt-2 leading-relaxed">
            お渡しした<strong>専用リンク</strong>または<strong>QRコード</strong>からご利用ください。
          </p>
        </section>

        <div className="manual-a4-section">
          <MemberJourneyMap />
        </div>
        <div className="manual-a4-section">
          <MemberStepIllustrations />
        </div>

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

      <footer className="no-print p-4 text-center">
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
