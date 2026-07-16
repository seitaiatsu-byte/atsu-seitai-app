import { Video } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { MEMBER_GUIDE_STEPS } from '../lib/memberGuide';

type Props = {
  onOpenAdmin: () => void;
};

export default function HomePage({ onOpenAdmin }: Props) {
  return (
    <MemberPageShell>
      <MemberBrandHeader />

      <main className="flex-1 p-4 sm:p-6 max-w-lg mx-auto w-full space-y-5">
        <div className="member-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="member-icon-badge w-14 h-14">
              <Video size={28} />
            </div>
            <div>
              <h2 className="font-bold text-xl sm:text-2xl text-member-text">あなた専用の動画ルーム</h2>
              <p className="text-base sm:text-lg member-text-muted mt-1">
                院内でお渡ししたリンクから、ご自宅でセルフケア動画が見られます
              </p>
            </div>
          </div>
        </div>

        <MemberStepGuide steps={MEMBER_GUIDE_STEPS} />

        <div className="member-card-soft p-4 text-base leading-relaxed">
          <p className="font-bold text-member-text mb-2">お渡しするもの（2つ）</p>
          <ul className="list-disc list-inside space-y-1 member-text-muted">
            <li>① あなた専用のリンク（インターネットの住所）</li>
            <li>② 入室パス（数字など・院内でお渡し）</li>
          </ul>
          <p className="mt-3 member-text-muted">
            入室パスは定期的に変わることがあります。新しいパスは院内でお知らせします。
          </p>
        </div>

        <MemberHelpFooter large />
      </main>

      <footer className="p-4 text-center print:hidden">
        <button type="button" onClick={onOpenAdmin} className="member-link-subtle text-xs">
          スタッフ用管理
        </button>
      </footer>
    </MemberPageShell>
  );
}
