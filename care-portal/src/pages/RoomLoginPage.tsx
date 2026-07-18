import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import MemberBrandHeader from '../components/member/MemberBrandHeader';
import MemberPageShell from '../components/member/MemberPageShell';
import { loginRoom, peekRoomMember } from '../lib/careApi';
import { MEMBER_LOGIN_ERROR_FALLBACK } from '../lib/memberGuide';
import { saveSession } from '../lib/session';

type Props = {
  roomCode: string;
  onLoggedIn: () => void;
};

export default function RoomLoginPage({ roomCode, onLoggedIn }: Props) {
  const [password, setPassword] = useState('');
  const [memberName, setMemberName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void peekRoomMember(roomCode).then((name) => {
      if (!cancelled) setMemberName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await loginRoom(roomCode, password.trim());
      saveSession(session);
      onLoggedIn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.includes('正しく')
            ? err.message
            : '入室パスが正しくないか、入力し忘れがあります。もう一度お試しください。'
          : MEMBER_LOGIN_ERROR_FALLBACK
      );
    } finally {
      setLoading(false);
    }
  };

  const displayName = memberName || 'あなた';

  return (
    <MemberPageShell>
      <MemberBrandHeader />

      <main className="flex-1 p-4 sm:p-5 max-w-lg mx-auto w-full space-y-4">
        <p className="text-center text-xl sm:text-2xl font-bold text-member-text leading-relaxed px-2">
          パスワード入れたら
          <br />
          {displayName}さんの部屋へ行けます！
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="member-panel w-full p-5 sm:p-6">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-900 text-base px-4 py-3 leading-relaxed">
              {error}
            </div>
          )}

          <label className="block text-lg font-bold text-member-text mb-2" htmlFor="room-password">
            パスワード
          </label>
          <input
            id="room-password"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="member-input px-4 py-4 text-2xl tracking-wide"
            placeholder="例：0919"
            required
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="member-btn-primary mt-6 w-full flex items-center justify-center gap-2 text-xl py-4"
          >
            <LogIn size={22} />
            {loading ? '確認中…' : '部屋へ入る'}
          </button>
        </form>
      </main>
    </MemberPageShell>
  );
}
