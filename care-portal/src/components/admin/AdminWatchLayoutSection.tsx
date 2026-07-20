import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Save } from 'lucide-react';
import {
  adminGetStudyRoomTitle,
  adminListGreetingVideos,
  adminListSubRoomMaster,
  adminListWatchLayout,
  adminSaveWatchLayout,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot } from '../../lib/greetingVideos';
import { DEFAULT_STUDY2_ROOM_TITLE, DEFAULT_STUDY_ROOM_TITLE } from '../../lib/studyRoom';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT } from '../../lib/subRooms';
import {
  watchLayoutKindLabel,
  watchLayoutLabel,
  type WatchLayoutItemKey,
} from '../../lib/watchLayout';

export default function AdminWatchLayoutSection() {
  const [keys, setKeys] = useState<WatchLayoutItemKey[]>([]);
  const [studyTitle, setStudyTitle] = useState(DEFAULT_STUDY_ROOM_TITLE);
  const [study2Title, setStudy2Title] = useState(DEFAULT_STUDY2_ROOM_TITLE);
  const [greetingTitles, setGreetingTitles] = useState<Partial<Record<GreetingSlot, string>>>({});
  const [subRoomTitles, setSubRoomTitles] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [layout, study, study2, greetings, master] = await Promise.all([
        adminListWatchLayout(),
        adminGetStudyRoomTitle('study'),
        adminGetStudyRoomTitle('study2'),
        adminListGreetingVideos(),
        adminListSubRoomMaster(),
      ]);
      setKeys(layout);
      setStudyTitle(study);
      setStudy2Title(study2);

      const gTitles: Partial<Record<GreetingSlot, string>> = { ...DEFAULT_GREETING_TITLES };
      for (const g of greetings) gTitles[g.slot_code] = g.title;
      setGreetingTitles(gTitles);

      const sTitles: Record<number, string> = { ...DEFAULT_SUB_ROOM_TITLES };
      for (let i = 1; i <= SUB_ROOM_COUNT; i++) {
        if (!sTitles[i]) sTitles[i] = `小部屋${i}`;
      }
      for (const m of master) sTitles[m.slot_number] = m.title;
      setSubRoomTitles(sTitles);
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const move = (index: number, direction: 'up' | 'down') => {
    const next = direction === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= keys.length) return;
    setKeys((prev) => {
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminSaveWatchLayout(keys);
      alert('表示順を保存しました。会員画面に反映されます。');
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
        <ListOrdered size={18} className="text-indigo-600" />
        会員画面の表示順
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        勉強部屋・挨拶A/B/C・小部屋20枠の並びを上下で入れ替え、「表示順を保存」で全会員ルームに反映されます。
      </p>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? '保存中…' : '表示順を保存'}
        </button>
      </div>

      <ul className="space-y-2">
        {keys.map((key, index) => (
          <li key={key} className="bg-white rounded-xl border p-3 flex items-start gap-3">
            <span className="shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-indigo-700">
                {watchLayoutKindLabel(key, { greetingTitles })}
              </p>
              <p className="text-sm font-bold text-slate-800 mt-0.5 leading-snug line-clamp-2">
                {watchLayoutLabel(key, { studyTitle, study2Title, greetingTitles, subRoomTitles })}
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, 'up')}
                className="text-xs px-2 py-1 rounded border disabled:opacity-30 hover:bg-slate-50"
                title="上へ"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={index === keys.length - 1}
                onClick={() => move(index, 'down')}
                className="text-xs px-2 py-1 rounded border disabled:opacity-30 hover:bg-slate-50"
                title="下へ"
              >
                <ArrowDown size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
