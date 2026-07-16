import { Video } from 'lucide-react';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { MEMBER_GUIDE_STEPS } from '../lib/memberGuide';

type Props = {
  onOpenAdmin: () => void;
};

export default function HomePage({ onOpenAdmin }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-teal-700 text-white px-4 py-6 shadow-md">
        <h1 className="text-2xl sm:text-3xl font-bold">あつ整体院</h1>
        <p className="text-teal-100 text-lg mt-2">会員専用セルフケア動画</p>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-lg mx-auto w-full space-y-5">
        <div className="rounded-2xl bg-white border border-teal-100 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 shrink-0">
              <Video size={28} />
            </div>
            <div>
              <h2 className="font-bold text-xl sm:text-2xl text-slate-800">あなた専用の動画ルーム</h2>
              <p className="text-base sm:text-lg text-slate-600 mt-1">
                院内でお渡ししたリンクから、ご自宅でセルフケア動画が見られます
              </p>
            </div>
          </div>
        </div>

        <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />

        <div className="rounded-xl bg-white border border-slate-200 p-4 text-base text-slate-700 leading-relaxed">
          <p className="font-bold text-slate-800 mb-2">お渡しするもの（2つ）</p>
          <ul className="list-disc list-inside space-y-1">
            <li>① あなた専用のリンク（インターネットの住所）</li>
            <li>② 入室パス（数字など・院内でお渡し）</li>
          </ul>
          <p className="mt-3 text-slate-600">
            入室パスは定期的に変わることがあります。新しいパスは院内でお知らせします。
          </p>
        </div>

        <MemberHelpFooter large />
      </main>

      <footer className="p-4 text-center print:hidden">
        <button
          type="button"
          onClick={onOpenAdmin}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          スタッフ用管理
        </button>
      </footer>
    </div>
  );
}
