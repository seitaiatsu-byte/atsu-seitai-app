import { useState } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { loginRoom } from '../lib/careApi';
import { saveSession } from '../lib/session';

type Props = {
  roomCode: string;
  onLoggedIn: () => void;
};

export default function RoomLoginPage({ roomCode, onLoggedIn }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await loginRoom(roomCode, password);
      saveSession(session);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : '入室に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-teal-50 to-slate-50">
      <header className="bg-teal-700 text-white px-4 py-4">
        <p className="text-xs text-teal-200">会員専用ルーム</p>
        <h1 className="font-bold text-lg truncate">{roomCode}</h1>
      </header>

      <main className="flex-1 flex items-center justify-center p-5">
        <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-teal-100 p-6">
          <div className="flex items-center gap-2 text-teal-700 mb-4">
            <Lock size={20} />
            <h2 className="font-bold">入室パスを入力</h2>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <label className="block text-sm font-bold text-slate-700 mb-1">入室パス</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-teal-500 outline-none text-lg"
            placeholder="お渡ししたパス"
            required
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
          >
            <LogIn size={18} />
            {loading ? '確認中…' : '入室する'}
          </button>

          <p className="text-xs text-slate-500 mt-4 text-center">
            パスがわからない場合は院内にお問い合わせください
          </p>
        </form>
      </main>
    </div>
  );
}
