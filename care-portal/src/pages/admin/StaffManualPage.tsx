import { BookOpen, LogIn, Shield } from 'lucide-react';
import ManualFlowTimeline from '../../components/member/ManualFlowTimeline';
import { MEMBER_GUIDE_STEPS, STAFF_CHECKLIST, STAFF_FULL_FLOW, STAFF_ROOM_CONVENTION, STAFF_SITE_PURPOSE } from '../../lib/memberGuide';

type Props = {
  onGoLogin: () => void;
  onGoHome: () => void;
};

export default function StaffManualPage({ onGoLogin, onGoHome }: Props) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-indigo-800 text-white px-4 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Shield size={24} />
          <div>
            <h1 className="font-bold text-lg sm:text-xl">スタッフ向け・操作マニュアル</h1>
            <p className="text-indigo-200 text-sm mt-0.5">会員への渡し方から管理画面の操作まで</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-10">
        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen size={20} />
            {STAFF_SITE_PURPOSE.title}
          </h2>
          <p className="text-base text-slate-600 leading-relaxed">{STAFF_SITE_PURPOSE.body}</p>
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 text-sm sm:text-base">
            <p className="font-bold text-indigo-900">スタッフ管理画面の入口</p>
            <p className="mt-2 font-mono break-all text-indigo-800">
              {origin}
              /admin/login
            </p>
            <button
              type="button"
              onClick={onGoLogin}
              className="mt-3 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm"
            >
              <LogIn size={16} />
              管理ログインを開く
            </button>
          </div>
        </section>

        <section className="bg-amber-50 rounded-2xl border border-amber-200 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-amber-950 mb-3">会員さんはトップページを見ない</h2>
          <p className="text-base text-amber-900 leading-relaxed">
            会員が日常で開くのは <strong>お渡しの専用リンク（/r/部屋コード）</strong> または <strong>QR</strong> だけです。
            トップ（/）は受付スタッフ向けの「はじめてガイド」です。渡すときは必ずルーム詳細の QR か URL を使ってください。
          </p>
        </section>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-slate-800">{STAFF_ROOM_CONVENTION.title}</h2>
          {STAFF_ROOM_CONVENTION.rules.map((r) => (
            <div key={r.label} className="rounded-xl bg-slate-50 border p-4 text-sm">
              <p className="font-bold text-slate-800">{r.label}</p>
              <p className="text-indigo-700 font-bold mt-1">{r.rule}</p>
              <p className="text-slate-600 mt-1">{r.example}</p>
            </div>
          ))}
        </section>

        <div className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm">
          <ManualFlowTimeline title="スタッフの作業の流れ（順番どおり）" steps={STAFF_FULL_FLOW} />
        </div>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">会員への説明（そのまま読める）</h2>
          <p className="text-sm text-slate-500 mb-3">会員さんに伝える操作は次の3ステップです。</p>
          <ol className="space-y-3">
            {MEMBER_GUIDE_STEPS.map((s) => (
              <li key={s.number} className="rounded-xl border bg-slate-50 p-4">
                <p className="font-bold text-slate-800">
                  {s.number}. {s.title}
                </p>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-3">会員にお渡しする前のチェックリスト</h2>
          <ul className="space-y-2">
            {STAFF_CHECKLIST.map((item) => (
              <li key={item} className="flex gap-2 text-sm sm:text-base text-slate-700">
                <span className="text-teal-600 font-bold">□</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm text-sm text-slate-600 leading-relaxed">
          <h2 className="text-base font-bold text-slate-800 mb-2">よくある場所（URLの意味）</h2>
          <ul className="space-y-2 font-mono text-xs sm:text-sm">
            <li>
              <span className="text-slate-500">/admin/login</span> … スタッフログイン
            </li>
            <li>
              <span className="text-slate-500">/admin/rooms</span> … 会員ルーム一覧
            </li>
            <li>
              <span className="text-slate-500">/r/部屋コード</span> … 会員の入口（QRの行き先）
            </li>
            <li>
              <span className="text-slate-500">/watch</span> … 動画一覧（入室後のみ）
            </li>
            <li>
              <span className="text-slate-500">/guide?member=…&room=…</span> … 印刷用案内（会員の日常URLではない）
            </li>
            <li>
              <span className="text-slate-500">/manual</span> … 会員向け取扱説明書（A4印刷・PDF。スマホで見せない）
            </li>
          </ul>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onGoLogin}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm"
          >
            管理ログインへ
          </button>
          <button type="button" onClick={onGoHome} className="border border-slate-300 bg-white hover:bg-slate-50 font-bold px-5 py-2.5 rounded-xl text-sm text-slate-700">
            トップへ
          </button>
        </div>
      </main>
    </div>
  );
}
