import { Printer } from 'lucide-react';
import MemberRoomQrCard from '../components/admin/MemberRoomQrCard';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { buildMemberRoomUrl, MEMBER_GUIDE_STEPS } from '../lib/memberGuide';

type Props = {
  memberName?: string;
  roomCode?: string;
  roomUrl?: string;
};

export default function MemberGuidePage({ memberName, roomCode, roomUrl }: Props) {
  const displayUrl = roomUrl || (roomCode ? buildMemberRoomUrl(roomCode) : '（スタッフがお渡しするリンク）');
  const displayName = memberName?.trim() || '＿＿＿＿＿＿ さん';

  return (
    <MemberPageShell className="member-guide-print" noWatermark>
      <MemberBrandHeader />

      <div className="no-print sticky top-0 z-30 border-b border-member-gold-soft/50 bg-member-camel-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-member-gold-deep">会員用・印刷プレビュー（この帯は印刷されません）</p>
        <button type="button" onClick={() => window.print()} className="member-btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0">
          <Printer size={18} />
          印刷する
        </button>
      </div>

      <article className="max-w-3xl mx-auto p-6 sm:p-10 print:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-member-gold-deep mb-6">
          セルフケア動画の見方　対象：{displayName}
        </h2>

        <section className="mb-8 member-card p-5 sm:p-6">
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
              <p className="font-bold member-text-emerald">② 入室パス（数字など、当院からお渡し）</p>
              <p className="mt-2 text-2xl font-bold tracking-widest border-b-2 border-member-gold-soft inline-block min-w-[8rem] pb-1">
                ＿＿＿＿＿＿
              </p>
              <p className="text-base member-text-muted mt-2">※口頭・LINE・紙などでお渡しします。ここに書き写しても構いません。</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-member-gold-deep mb-4">操作の手順（3ステップ）</h2>
          <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        </section>

        <div className="mb-8">
          <MemberHandoutSection />
        </div>

        <MemberHelpFooter large />

        <footer className="text-center text-sm member-text-muted pt-6 mt-8 border-t border-member-gold-soft/40">
          あつ整体院 会員専用セルフケア動画
        </footer>
      </article>
    </MemberPageShell>
  );
}
