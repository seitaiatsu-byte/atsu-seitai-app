import { BookOpen, Video } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { MEMBER_ENTRY_EXPLAIN, MEMBER_GUIDE_STEPS, MEMBER_SITE_PURPOSE } from '../lib/memberGuide';

type Props = {
  onOpenAdmin: () => void;
  onOpenManual: () => void;
};

export default function HomePage({ onOpenAdmin, onOpenManual }: Props) {
  return (
    <MemberPageShell>
      <MemberBrandHeader />

      <main className="flex-1 p-4 sm:p-6 max-w-lg mx-auto w-full space-y-5">
        <section className="member-panel p-5 sm:p-6 space-y-3 border-member-teal/20">
          <h2 className="font-bold text-lg text-member-gold-deep">はじめに（会員の方へ）</h2>
          <p className="text-base member-text-muted leading-relaxed">{MEMBER_SITE_PURPOSE.body}</p>
          <p className="text-base font-bold text-member-text leading-relaxed">
            このページ（トップ）から動画を見る必要はありません。
            <br />
            当院からお渡しした<strong>専用リンク</strong>または<strong>QRコード</strong>を開いてください。
          </p>
          <ul className="text-sm member-text-muted space-y-1.5 list-disc list-inside">
            {MEMBER_ENTRY_EXPLAIN.points.slice(0, 2).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <div className="member-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="member-icon-badge w-14 h-14">
              <Video size={28} />
            </div>
            <div>
              <h2 className="font-bold text-xl sm:text-2xl text-member-text">あなた専用の動画ルーム</h2>
              <p className="text-base sm:text-lg member-text-muted mt-1">
                お渡しのリンクを開いたあと、次の3ステップで動画が見られます
              </p>
            </div>
          </div>
        </div>

        <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />
        <MemberHandoutSection />
        <MemberHelpFooter large />

        <button
          type="button"
          onClick={onOpenManual}
          className="member-btn-secondary w-full flex items-center justify-center gap-2 py-3.5 text-base"
        >
          <BookOpen size={20} />
          くわしい使い方マニュアル（会員向け）
        </button>
      </main>

      <footer className="p-4 text-center print:hidden space-y-2">
        <button type="button" onClick={onOpenAdmin} className="member-link-subtle text-xs block mx-auto">
          スタッフ用管理・マニュアル
        </button>
      </footer>
    </MemberPageShell>
  );
}
