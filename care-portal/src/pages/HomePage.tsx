import { BookOpen, ClipboardCopy, ExternalLink, LogIn, Printer, Share2, Shield } from 'lucide-react';
import {
  MEMBER_MANUAL_PATH,
  STAFF_ENTRY_URL,
  STAFF_RECEPTION_INTRO,
  STAFF_RECEPTION_STEPS,
  STAFF_ROOM_CONVENTION,
} from '../lib/memberGuide';

type Props = {
  onOpenAdminLogin: () => void;
  onOpenStaffManual: () => void;
  onOpenMemberManual: () => void;
};

/** 受付スタッフ向けのはじめてガイド（会員の入り口ではない） */
export default function HomePage({ onOpenAdminLogin, onOpenStaffManual, onOpenMemberManual }: Props) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-indigo-800 text-white px-4 py-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-indigo-200 text-sm">あつ整体院</p>
          <h1 className="font-bold text-xl sm:text-2xl mt-1">{STAFF_RECEPTION_INTRO.title}</h1>
          <p className="text-indigo-100 text-sm sm:text-base mt-2 leading-relaxed">{STAFF_RECEPTION_INTRO.subtitle}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-10">
        <section className="bg-amber-50 rounded-2xl border border-amber-200 p-4 sm:p-5">
          <p className="text-sm sm:text-base text-amber-900 leading-relaxed font-bold">{STAFF_RECEPTION_INTRO.note}</p>
          <p className="text-sm text-amber-800 mt-2 leading-relaxed">
            会員さんの入口は <strong>/r/部屋コード</strong>（例：/r/room-7a53）です。スタッフが部屋を作ってから、URLと入室パスをお渡しします。
          </p>
        </section>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">全体の流れ（イメージ）</h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm sm:text-base text-center">
            <span className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 font-bold text-indigo-900">①スタッフが部屋を作る</span>
            <span className="text-slate-400">→</span>
            <span className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 font-bold text-teal-900">②URLとPASSを渡す</span>
            <span className="text-slate-400">→</span>
            <span className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 font-bold text-amber-900">③会員が動画を見る</span>
          </div>
        </section>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-800">{STAFF_ROOM_CONVENTION.title}</h2>
          <div className="space-y-3">
            {STAFF_ROOM_CONVENTION.rules.map((r) => (
              <div key={r.label} className="rounded-xl bg-slate-50 border p-4">
                <p className="font-bold text-slate-800">{r.label}</p>
                <p className="text-indigo-700 font-bold mt-1">{r.rule}</p>
                <p className="text-sm text-slate-600 mt-1">{r.example}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{STAFF_ROOM_CONVENTION.note}</p>
        </section>

        <section className="space-y-3">
          {STAFF_RECEPTION_STEPS.map((step) => (
            <article key={step.number} className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                  {step.number}
                </span>
                <div className="min-w-0 space-y-2">
                  <h3 className="font-bold text-lg text-slate-800">{step.title}</h3>
                  <p className="text-base text-slate-600 leading-relaxed">{step.body}</p>
                  {step.detail && (
                    <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                      {step.detail.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {step.number === 2 && (
                    <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 mt-2">
                      <p className="font-bold text-indigo-900 text-sm">スタッフ管理画面の入口</p>
                      <p className="mt-1 font-mono text-sm break-all text-indigo-800">
                        {origin}
                        {STAFF_ENTRY_URL}
                      </p>
                      <button
                        type="button"
                        onClick={onOpenAdminLogin}
                        className="mt-3 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm"
                      >
                        <LogIn size={16} />
                        管理ログインを開く
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="bg-white rounded-2xl border p-5 sm:p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-slate-800">会員にお渡しする説明書（2通り）</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="font-bold text-slate-800">① A4で印刷・PDF</p>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                取扱説明書をA4で印刷して渡せます。PDFにする場合は「PDFとして保存」を選んでください。
              </p>
              <button
                type="button"
                onClick={onOpenMemberManual}
                className="mt-3 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-lg text-sm"
              >
                <Printer size={16} />
                取扱説明書を開く
              </button>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <p className="font-bold text-slate-800">② スマホで見るURL</p>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                同じ説明書をスマホで見られるURLです。LINEで送れます。
              </p>
              <p className="mt-2 font-mono text-xs break-all text-teal-800 bg-white border rounded-lg p-2">
                {origin}
                {MEMBER_MANUAL_PATH}
              </p>
              <button
                type="button"
                onClick={onOpenMemberManual}
                className="mt-3 inline-flex items-center gap-2 border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 font-bold px-4 py-2 rounded-lg text-sm"
              >
                <ExternalLink size={16} />
                スマホ用ページを開く
              </button>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onOpenAdminLogin}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2"
          >
            <LogIn size={16} />
            管理ログインへ
          </button>
          <button
            type="button"
            onClick={onOpenStaffManual}
            className="border border-slate-300 bg-white hover:bg-slate-50 font-bold px-5 py-2.5 rounded-xl text-sm text-slate-700 inline-flex items-center gap-2"
          >
            <Shield size={16} />
            くわしいスタッフマニュアル
          </button>
          <button
            type="button"
            onClick={onOpenMemberManual}
            className="border border-teal-300 bg-teal-50 hover:bg-teal-100 font-bold px-5 py-2.5 rounded-xl text-sm text-teal-900 inline-flex items-center gap-2"
          >
            <BookOpen size={16} />
            会員向け取扱説明書
          </button>
        </div>
      </main>
    </div>
  );
}
