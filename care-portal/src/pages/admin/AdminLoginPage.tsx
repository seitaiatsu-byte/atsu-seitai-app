import { useEffect, useState } from 'react';
import { LogIn, Shield } from 'lucide-react';
import { adminSignIn, isStaffUser } from '../../lib/careApi';
import { supabase } from '../../lib/supabase';

type Props = {
  onLoggedIn: () => void;
  onOpenManual?: () => void;
};

export default function AdminLoginPage({ onLoggedIn, onOpenManual }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const staff = await isStaffUser();
        if (!cancelled && staff) {
          onLoggedIn();
          return;
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 初回マウント時のみ：すでにスタッフなら管理画面へ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminSignIn(email.trim(), password);
      const staff = await isStaffUser();
      if (!staff) {
        await supabase.auth.signOut();
        throw new Error('このアカウントはスタッフとして登録されていません（care_staff テーブル）');
      }
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 app-screen-pad bg-slate-100">
        <p className="text-slate-500 text-sm">確認中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 app-screen-pad bg-slate-100">
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-md bg-white rounded-2xl shadow-lg border p-6">
        <div className="flex items-center gap-2 text-indigo-700 mb-4">
          <Shield size={22} />
          <h1 className="font-bold text-lg">スタッフ管理ログイン</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{error}</div>
        )}

        <label className="block text-sm font-bold text-slate-700 mb-1">メール</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border mb-3"
          required
          autoComplete="username"
        />

        <label className="block text-sm font-bold text-slate-700 mb-1">パスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border mb-4"
          required
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
        >
          <LogIn size={18} />
          {loading ? 'ログイン中…' : 'ログイン'}
        </button>

        <p className="text-xs text-slate-500 mt-4">
          初回は Supabase Auth でユーザーを作成し、<code>care_staff</code> に user_id を登録してください。
        </p>

        {onOpenManual && (
          <button
            type="button"
            onClick={onOpenManual}
            className="mt-4 w-full text-sm text-indigo-600 hover:text-indigo-800 font-bold underline"
          >
            スタッフ向け操作マニュアルを読む
          </button>
        )}
      </form>
    </div>
  );
}
