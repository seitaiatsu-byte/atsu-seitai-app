import { useEffect, useState } from 'react';
import { Type, Save } from 'lucide-react';
import {
  adminGetGreetingZoneLabel,
  adminGetWatchTopTitle,
  adminUpdateGreetingZoneLabel,
  adminUpdateWatchTopTitle,
} from '../../lib/careApi';
import { DEFAULT_GREETING_ZONE_LABEL } from '../../lib/greetingVideos';
import { DEFAULT_WATCH_TOP_TITLE } from '../../lib/studyRoom';

export default function AdminWatchTopTitleSection() {
  const [title, setTitle] = useState(DEFAULT_WATCH_TOP_TITLE);
  const [greetingLabel, setGreetingLabel] = useState(DEFAULT_GREETING_ZONE_LABEL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingGreeting, setSavingGreeting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [top, zone] = await Promise.all([adminGetWatchTopTitle(), adminGetGreetingZoneLabel()]);
      setTitle(top);
      setGreetingLabel(zone);
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

  const handleSaveGreetingLabel = async () => {
    setSavingGreeting(true);
    try {
      await adminUpdateGreetingZoneLabel(greetingLabel);
      alert('あいさつ枠の文言を保存しました');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSavingGreeting(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">読み込み中…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <Type size={18} className="text-indigo-600" />
        会員画面の見出し文言
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        TOPタイトルと、あいさつカードの顔の横の文言を編集できます（全院共通）。
      </p>
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <label className="text-xs font-bold text-slate-500">TOPタイトル</label>
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
          {saving ? '保存中…' : 'TOPタイトルを保存'}
        </button>
      </div>
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <label className="text-xs font-bold text-slate-500">顔の横の文言（枠の外・上部）</label>
        <input
          value={greetingLabel}
          onChange={(e) => setGreetingLabel(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          placeholder={DEFAULT_GREETING_ZONE_LABEL}
        />
        <p className="text-[11px] text-slate-500">
          あいさつカードの顔の真横に出ます。枠内の2行タイトルは「小部屋マスター → 挨拶動画」で Enter 改行して編集できます。
        </p>
        <button
          type="button"
          disabled={savingGreeting}
          onClick={() => void handleSaveGreetingLabel()}
          className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Save size={14} />
          {savingGreeting ? '保存中…' : 'あいさつ文言を保存'}
        </button>
      </div>
    </section>
  );
}
