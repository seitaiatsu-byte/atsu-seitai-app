import { type ReactNode } from 'react';
import { Link2, LogIn, PlayCircle, QrCode, Smartphone } from 'lucide-react';
import { MEMBER_GUIDE_STEPS } from '../../lib/memberGuide';

function ArrowDown() {
  return (
    <div className="manual-diagram-arrow flex justify-center py-2" aria-hidden>
      <span className="text-member-gold text-2xl font-bold">▼</span>
    </div>
  );
}

function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="manual-phone-frame">
      <div className="manual-phone-notch" />
      <div className="manual-phone-screen">{children}</div>
      <p className="manual-phone-label">{label}</p>
    </div>
  );
}

export function MemberJourneyMap() {
  return (
    <section className="member-card p-4 sm:p-6">
      <h2 className="text-lg font-bold text-member-gold-deep mb-4 text-center">全体の道のり（図解）</h2>
      <div className="manual-journey-grid">
        <div className="manual-journey-box">
          <p className="manual-journey-num">A</p>
          <p className="font-bold text-sm text-member-text">お渡し</p>
          <div className="flex justify-center gap-3 mt-2 text-member-teal">
            <QrCode size={28} />
            <Link2 size={28} />
          </div>
          <p className="text-xs member-text-muted mt-2">QR または URL</p>
        </div>
        <div className="manual-journey-arrow">→</div>
        <div className="manual-journey-box">
          <p className="manual-journey-num">B</p>
          <p className="font-bold text-sm text-member-text">専用ページを開く</p>
          <Smartphone size={28} className="mx-auto mt-2 text-member-teal" />
          <p className="text-xs member-text-muted mt-2">スマホでタップ</p>
        </div>
        <div className="manual-journey-arrow">→</div>
        <div className="manual-journey-box">
          <p className="manual-journey-num">C</p>
          <p className="font-bold text-sm text-member-text">入室パス入力</p>
          <LogIn size={28} className="mx-auto mt-2 text-member-teal" />
          <p className="text-xs member-text-muted mt-2">「動画を見る」</p>
        </div>
        <div className="manual-journey-arrow">→</div>
        <div className="manual-journey-box">
          <p className="manual-journey-num">D</p>
          <p className="font-bold text-sm text-member-text">動画を再生</p>
          <PlayCircle size={28} className="mx-auto mt-2 text-member-teal" />
          <p className="text-xs member-text-muted mt-2">▶ をタップ</p>
        </div>
      </div>
      <p className="text-center text-sm member-text-muted mt-4">
        ※ トップページ（サイトの表紙）から入る必要はありません。必ず <strong>お渡しのリンク／QR</strong> から。
      </p>
    </section>
  );
}

export default function MemberStepIllustrations() {
  const [step1, step2, step3] = MEMBER_GUIDE_STEPS;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-member-gold-deep mb-3 px-1">操作の手順（図解つき）</h2>

      <div className="manual-step-figure member-card p-4 sm:p-5">
        <p className="manual-step-badge">ステップ 1</p>
        <h3 className="font-bold text-member-text text-base sm:text-lg mt-2">{step1.title}</h3>
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-6">
          <div className="text-center">
            <div className="manual-illust-qr w-24 h-24 mx-auto rounded-lg border-2 border-member-gold flex items-center justify-center bg-white">
              <QrCode size={48} className="text-member-text" />
            </div>
            <p className="text-xs member-text-muted mt-2">QRを読み取る</p>
          </div>
          <p className="text-member-gold font-bold text-xl">または</p>
          <PhoneFrame label="青い文字をタップ">
            <p className="text-xs text-blue-600 underline break-all px-2 py-4">
              https://atsu-care-portal…/r/room-xxxx
            </p>
          </PhoneFrame>
        </div>
        <p className="text-sm member-text-muted mt-4 leading-relaxed">{step1.body}</p>
      </div>

      <ArrowDown />

      <div className="manual-step-figure member-card p-4 sm:p-5">
        <p className="manual-step-badge">ステップ 2</p>
        <h3 className="font-bold text-member-text text-base sm:text-lg mt-2">{step2.title}</h3>
        <div className="mt-4 flex justify-center">
          <PhoneFrame label="この画面が出ます">
            <div className="p-3 space-y-3">
              <p className="text-xs font-bold text-member-text">入室パスワード</p>
              <div className="manual-illust-input border-2 border-member-gold rounded-lg py-2 text-center font-bold tracking-widest">
                0 9 1 9
              </div>
              <div className="manual-illust-btn bg-member-teal text-white text-xs font-bold py-2 rounded-lg text-center">
                動画を見る
              </div>
            </div>
          </PhoneFrame>
        </div>
        <p className="text-sm member-text-muted mt-4 leading-relaxed">{step2.body}</p>
      </div>

      <ArrowDown />

      <div className="manual-step-figure member-card p-4 sm:p-5">
        <p className="manual-step-badge">ステップ 3</p>
        <h3 className="font-bold text-member-text text-base sm:text-lg mt-2">{step3.title}</h3>
        <div className="mt-4 flex justify-center">
          <PhoneFrame label="動画の名前をタップ">
            <div className="p-2 space-y-2">
              <div className="manual-illust-video-row flex items-center gap-2 border rounded-lg p-2 bg-member-camel-card">
                <PlayCircle size={20} className="text-member-teal shrink-0" />
                <span className="text-xs font-bold">セルフケア動画①</span>
              </div>
              <div className="manual-illust-video-row flex items-center gap-2 border rounded-lg p-2 opacity-60">
                <PlayCircle size={20} className="shrink-0" />
                <span className="text-xs">セルフケア動画②</span>
              </div>
              <p className="text-[10px] text-member-teal font-bold text-center">▶ タップして再生</p>
            </div>
          </PhoneFrame>
        </div>
        <p className="text-sm member-text-muted mt-4 leading-relaxed">{step3.body}</p>
      </div>
    </section>
  );
}
