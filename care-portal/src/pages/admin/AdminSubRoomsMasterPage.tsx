import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { adminListSubRoomMaster, adminUpdateSubRoomTitle } from '../../lib/careApi';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT } from '../../lib/subRooms';

type Props = {
  onBack: () => void;
};

export default function AdminSubRoomsMasterPage({ onBack }: Props) {
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await adminListSubRoomMaster();
      const map: Record<number, string> = {};
      for (let i = 1; i <= SUB_ROOM_COUNT; i++) {
        map[i] = DEFAULT_SUB_ROOM_TITLES[i] || `小部屋${i}`;
      }
      for (const row of rows) {
        map[row.slot_number] = row.title;
      }
      setTitles(map);
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (slot: number) => {
    const title = titles[slot]?.trim();
    if (!title) {
      alert('タイトルを入力してください');
      return;
    }
    setSaving(slot);
    try {
      await adminUpdateSubRoomTitle(slot, title);
      alert(`小部屋${slot}のタイトルを保存しました`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <header className="bg-indigo-700 text-white px-4 py-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-indigo-200 mb-1">
          <ArrowLeft size={16} />
          ルーム一覧へ
        </button>
        <h1 className="font-bold text-lg">小部屋マスター（15枠）</h1>
        <p className="text-xs text-indigo-200 mt-1">
          ここで設定した名前が、全会員ルームの小部屋タイトルに反映されます
        </p>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {loading ? (
          <p className="text-center text-slate-500 py-12">読み込み中…</p>
        ) : (
          <ul className="space-y-3">
            {Array.from({ length: SUB_ROOM_COUNT }, (_, i) => i + 1).map((slot) => (
              <li key={slot} className="bg-white rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-sm">
                    {slot}
                  </span>
                  <div className="flex-1 min-w-0 space-y-2">
                    <label className="text-xs font-bold text-slate-500">小部屋の名前</label>
                    <input
                      value={titles[slot] || ''}
                      onChange={(e) => setTitles((prev) => ({ ...prev, [slot]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      placeholder={`小部屋${slot}`}
                    />
                    <button
                      type="button"
                      disabled={saving === slot}
                      onClick={() => void handleSave(slot)}
                      className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Save size={14} />
                      {saving === slot ? '保存中…' : 'この枠を保存'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
