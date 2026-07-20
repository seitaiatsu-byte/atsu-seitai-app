import { useEffect, useState } from 'react';
import { Type, Save } from 'lucide-react';
import { adminGetWatchTopTitle, adminUpdateWatchTopTitle } from '../../lib/careApi';
import { DEFAULT_WATCH_TOP_TITLE } from '../../lib/studyRoom';

export default function AdminWatchTopTitleSection() {
  const [title, setTitle] = useState(DEFAULT_WATCH_TOP_TITLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTitle(await adminGetWatchTopTitle());
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminUpdateWatchTopTitle(title);
      alert('TOPタイトルを保存しました');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">読み込み中…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <Type size={18} className="text-indigo-600" />
        会員画面の TOP タイトル
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        勉強部屋の下・動画一覧の上に表示される見出しです（全院共通）。
      </p>
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <label className="text-xs font-bold text-slate-500">タイトル</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          placeholder={DEFAULT_WATCH_TOP_TITLE}
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? '保存中…' : 'タイトルを保存'}
        </button>
      </div>
    </section>
  );
}
