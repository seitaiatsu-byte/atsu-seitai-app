import { Printer } from 'lucide-react';
import MemberRoomQrCard from '../components/admin/MemberRoomQrCard';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { buildMemberRoomUrl, CLINIC_HELP_LINE, MEMBER_GUIDE_STEPS } from '../lib/memberGuide';

type Props = {
  memberName?: string;
  roomCode?: string;
  roomUrl?: string;
};

export default function MemberGuidePage({ memberName, roomCode, roomUrl }: Props) {
  const displayUrl = roomUrl || (roomCode ? buildMemberRoomUrl(roomCode) : '（スタッフがお渡しするリンク）');
  const displayName = memberName?.trim() || '＿＿＿＿＿＿ さん';

  return (
    <div className="member-guide-print min-h-screen bg-white text-slate-900">
      <div className="no-print sticky top-0 z-10 bg-slate-800 text-white px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm font-bold">会員用・印刷プレビュー（この帯は印刷されません）</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 font-bold text-sm shrink-0"
        >
          <Printer size={18} />
          印刷する
        </button>
      </div>

      <article className="max-w-3xl mx-auto p-6 sm:p-10 print:p-8">
        <div className="mb-8 pb-6 border-b-2 border-[#2a7f7a]/20">
          <MemberBrandHeader
            variant="print"
            title="あつ整体院"
            subtitle={`セルフケア動画の見方　対象：${displayName}`}
          />
        </div>

        <section className="mb-8 rounded-2xl border-2 border-slate-300 p-5 sm:p-6 bg-slate-50">
          <h2 className="text-xl font-bold mb-4">お渡しするもの（2つ）</h2>
          <div className="space-y-4 text-lg leading-relaxed">
            <div>
              <p className="font-bold text-teal-800">① あなた専用のリンク</p>
              {roomCode ? (
                <div className="mt-3">
                  <MemberRoomQrCard memberName={displayName.replace(/ さん$/, '')} roomCode={roomCode} compact />
                </div>
              ) : (
                <>
                  <p className="mt-2 break-all font-mono text-base sm:text-lg bg-white border border-slate-200 rounded-lg p-3">
                    {displayUrl}
                  </p>
                  <p className="text-base text-slate-600 mt-2">スマホでは青い文字をタップ。パソコンではクリック。</p>
                </>
              )}
            </div>
            <div>
              <p className="font-bold text-teal-800">② 入室パス</p>
              <p className="mt-2 text-2xl font-bold tracking-widest border-b-2 border-slate-400 inline-block min-w-[8rem] pb-1">
                ＿＿＿＿＿＿
              </p>
              <p className="text-base text-slate-600 mt-2">※院内で口頭または紙でお渡しします。ここに書き写しても構いません。</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">操作の手順（3ステップ）</h2>
          <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        </section>

        <section className="mb-8 rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-lg leading-relaxed">
          <p className="font-bold text-amber-950 text-xl">困ったとき</p>
          <p className="mt-2">{CLINIC_HELP_LINE}</p>
          <p className="mt-3 text-base text-amber-900">
            入室パスは定期的に変わることがあります。新しいパスは院内でお知らせします。
          </p>
        </section>

        <footer className="text-center text-sm text-slate-500 pt-6 border-t border-slate-200">
          あつ整体院 会員専用セルフケア動画
        </footer>
      </article>
    </div>
  );
}
