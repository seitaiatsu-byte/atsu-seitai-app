import { Video } from 'lucide-react';

type Props = {
  onOpenAdmin: () => void;
};

export default function HomePage({ onOpenAdmin }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-teal-700 text-white px-4 py-5 shadow-md">
        <h1 className="text-xl font-bold">あつ整体院</h1>
        <p className="text-teal-100 text-sm mt-1">会員専用セルフケア動画</p>
      </header>

      <main className="flex-1 p-5 max-w-lg mx-auto w-full">
        <div className="rounded-2xl bg-white border border-teal-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700">
              <Video size={24} />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-800">あなた専用の動画ルーム</h2>
              <p className="text-sm text-slate-600">院内でお渡ししたURLから入室してください</p>
            </div>
          </div>

          <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside bg-slate-50 rounded-xl p-4">
            <li>お渡しした部屋URLを開く</li>
            <li>入室パスを入力</li>
            <li>あなた専用のセルフケア動画を視聴</li>
          </ol>

          <p className="text-xs text-slate-500 mt-4">
            URLの例: <span className="font-mono text-slate-700">このサイト/r/お名前-xxxx</span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            入室パスは定期的に変更します。新しいパスは院内でお知らせします。
          </p>
        </div>
      </main>

      <footer className="p-4 text-center">
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
