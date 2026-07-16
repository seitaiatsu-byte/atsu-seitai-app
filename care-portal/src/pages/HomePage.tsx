import { BookOpen, Shield } from 'lucide-react';
import MemberHandoutSection from '../components/member/MemberHandoutSection';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import { MEMBER_ENTRY_EXPLAIN } from '../lib/memberGuide';

type Props = {
  onOpenAdmin: () => void;
  onOpenManual: () => void;
};

/** 会員の入り口ではない。スタッフ・説明用の表紙ページ */
export default function HomePage({ onOpenAdmin, onOpenManual }: Props) {
  return (
    <MemberPageShell noWatermark>
      <header className="member-site-subheader px-4 py-6">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-sm member-brand-eyebrow">あつ整体院</p>
          <h1 className="member-brand-title font-bold text-xl sm:text-2xl mt-1">会員専用システム（表紙）</h1>
          <p className="member-brand-subtitle text-sm sm:text-base mt-2 leading-relaxed">
            会員の方が動画を見る入り口ではありません
          </p>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-lg mx-auto w-full space-y-4">
        <section className="member-panel p-5 sm:p-6 space-y-3 border-amber-300/40 bg-amber-50/80">
          <h2 className="font-bold text-lg text-amber-950">会員（患者）の方へ</h2>
          <p className="text-base text-amber-900 leading-relaxed font-bold">
            このページからは動画は見られません。
          </p>
          <p className="text-base text-amber-900 leading-relaxed">
            お渡しした<strong>専用リンク</strong>または<strong>QRコード</strong>を、スマホで開いてください。
          </p>
          <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
            {MEMBER_ENTRY_EXPLAIN.points.slice(0, 2).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section className="member-card-soft p-4 text-sm member-text-muted leading-relaxed">
          <p className="font-bold text-member-text mb-2">スタッフの方へ</p>
          <p>会員への渡し方・管理画面の操作は、スタッフ向けマニュアルをご覧ください。取扱説明書は印刷して会員にお渡しできます。</p>
        </section>

        <button
          type="button"
          onClick={onOpenManual}
          className="member-btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base"
        >
          <BookOpen size={20} />
          会員向け取扱説明書（印刷用）
        </button>

        <MemberHandoutSection />
        <MemberHelpFooter large />
      </main>

      <footer className="p-4 text-center print:hidden">
        <button type="button" onClick={onOpenAdmin} className="member-link-subtle text-xs inline-flex items-center gap-1 mx-auto">
          <Shield size={14} />
          スタッフ用マニュアル・管理画面
        </button>
      </footer>
    </MemberPageShell>
  );
}
