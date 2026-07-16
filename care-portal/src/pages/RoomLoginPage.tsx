import { useState } from 'react';
import { LogIn } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberHelpFooter from '../components/member/MemberHelpFooter';
import MemberPageShell from '../components/member/MemberPageShell';
import MemberStepGuide from '../components/member/MemberStepGuide';
import { loginRoom } from '../lib/careApi';
import { MEMBER_GUIDE_STEPS } from '../lib/memberGuide';
import { saveSession } from '../lib/session';

type Props = {
  roomCode: string;
  onLoggedIn: () => void;
};

const LOGIN_STEPS = MEMBER_GUIDE_STEPS.filter((s) => s.number <= 2);

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
      setError(
        err instanceof Error
          ? err.message.includes('正しく')
            ? err.message
            : '入室パスが正しくないか、入力し忘れがあります。もう一度お試しください。'
          : '入室に失敗しました。院内にお問い合わせください。'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <MemberPageShell>
      <MemberBrandHeader
        eyebrow="あつ整体院・会員専用ルーム"
        title="ステップ2：入室パスを入力"
        subtitle="リンクは開けています。あと1つ入力すれば動画が見られます"
      />

      <main className="flex-1 p-4 sm:p-5 max-w-lg mx-auto w-full space-y-4">
        <MemberStepGuide currentStep={2} steps={LOGIN_STEPS} compact />

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="w-full bg-white/95 rounded-2xl shadow-lg border-2 border-[#2a7f7a]/20 p-5 sm:p-6 backdrop-blur-sm"
        >
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border-2 border-red-300 text-red-900 text-base px-4 py-3 leading-relaxed">
              {error}
            </div>
          )}

          <label className="block text-lg font-bold text-slate-800 mb-2" htmlFor="room-password">
            入室パス
          </label>
          <p className="text-base text-slate-600 mb-3">院内でお渡しした数字（または文字）をそのまま入れてください</p>
          <input
            id="room-password"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-4 rounded-xl border-2 border-slate-300 focus:border-[#2a7f7a] outline-none text-2xl tracking-wide text-center font-bold"
            placeholder="例：0919"
            required
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-[#2a7f7a] hover:bg-[#1f6b66] disabled:opacity-50 text-white font-bold text-xl py-4 rounded-xl shadow-md"
          >
            <LogIn size={22} />
            {loading ? '確認中…' : '動画を見る'}
          </button>
        </form>

        <MemberHelpFooter large />
      </main>
    </MemberPageShell>
  );
}
