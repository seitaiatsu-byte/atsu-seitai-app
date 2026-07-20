import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Trash2, Upload, Video } from 'lucide-react';
import AdminProgramRulesSection from '../../components/admin/AdminProgramRulesSection';
import AdminStudyRoomSection from '../../components/admin/AdminStudyRoomSection';
import AdminWatchLayoutSection from '../../components/admin/AdminWatchLayoutSection';
import AdminWatchTopTitleSection from '../../components/admin/AdminWatchTopTitleSection';
import {
  adminDeleteGreetingVideo,
  adminListGreetingVideos,
  adminListSubRoomMaster,
  adminUpdateGreetingTitle,
  adminUpdateSubRoomTitle,
  adminUploadGreetingVideo,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot, type GreetingVideoRow } from '../../lib/greetingVideos';
import {
  DEFAULT_SUB_ROOM_TITLES,
  DIET_SUB_ROOM_COUNT,
  DIET_SUB_ROOM_START,
  SUB_ROOM_COUNT,
} from '../../lib/subRooms';

const GREETING_SLOT_HINTS: Record<GreetingSlot, string> = {
  A: '部屋トップに表示',
  C: '⑫の直後に表示',
  B: 'ダイエット枠の後・⑬⑭⑮の直前に表示',
};

type Props = {
  onBack: () => void;
};

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminSubRoomsMasterPage({ onBack }: Props) {
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [greetings, setGreetings] = useState<Record<GreetingSlot, GreetingVideoRow | null>>({
    A: null,
    B: null,
    C: null,
  });
  const [greetingTitles, setGreetingTitles] = useState<Record<GreetingSlot, string>>({
    A: DEFAULT_GREETING_TITLES.A,
    B: DEFAULT_GREETING_TITLES.B,
    C: DEFAULT_GREETING_TITLES.C,
  });
  const [greetingFiles, setGreetingFiles] = useState<Record<GreetingSlot, File | null>>({
    A: null,
    B: null,
    C: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [greetingSaving, setGreetingSaving] = useState<GreetingSlot | null>(null);
  const [greetingUploading, setGreetingUploading] = useState<GreetingSlot | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, greetingRows] = await Promise.all([adminListSubRoomMaster(), adminListGreetingVideos()]);
      const map: Record<number, string> = {};
      for (let i = 1; i <= SUB_ROOM_COUNT; i++) {
        map[i] = DEFAULT_SUB_ROOM_TITLES[i] || `小部屋${i}`;
      }
      for (const row of rows) {
        map[row.slot_number] = row.title;
      }
      setTitles(map);

      const greetMap: Record<GreetingSlot, GreetingVideoRow | null> = { A: null, B: null, C: null };
      const greetTitles: Record<GreetingSlot, string> = {
        A: DEFAULT_GREETING_TITLES.A,
        B: DEFAULT_GREETING_TITLES.B,
        C: DEFAULT_GREETING_TITLES.C,
      };
      for (const row of greetingRows) {
        greetMap[row.slot_code] = row;
        greetTitles[row.slot_code] = row.title;
      }
      setGreetings(greetMap);
      setGreetingTitles(greetTitles);
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

  const handleGreetingTitleSave = async (slot: GreetingSlot) => {
    const title = greetingTitles[slot]?.trim();
    if (!title) {
      alert('タイトルを入力してください');
      return;
    }
    setGreetingSaving(slot);
    try {
      await adminUpdateGreetingTitle(slot, title);
      await load();
      alert(`挨拶動画${slot}のタイトルを保存しました`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setGreetingSaving(null);
    }
  };

  const handleGreetingUpload = async (slot: GreetingSlot) => {
    const file = greetingFiles[slot];
    if (!file) {
      alert('動画ファイルを選択してください');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      alert('ファイルは500MB以下にしてください');
      return;
    }
    setGreetingUploading(slot);
    try {
      await adminUploadGreetingVideo(slot, file, greetingTitles[slot] || DEFAULT_GREETING_TITLES[slot]);
      setGreetingFiles((prev) => ({ ...prev, [slot]: null }));
      await load();
      alert(`挨拶動画${slot}をアップロードしました`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setGreetingUploading(null);
    }
  };

  const handleGreetingDelete = async (slot: GreetingSlot) => {
    if (!greetings[slot]?.storage_path) return;
    if (!window.confirm(`挨拶動画${slot}を削除しますか？`)) return;
    try {
      await adminDeleteGreetingVideo(slot);
      await load();
      alert('削除しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <header className="bg-indigo-700 text-white px-4 py-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-indigo-200 mb-1">
          <ArrowLeft size={16} />
          ルーム一覧へ
        </button>
        <h1 className="font-bold text-lg">マスター設定</h1>
        <p className="text-xs text-indigo-200 mt-1">
          表示順・プログラムA〜E・鍵ルール・勉強部屋・挨拶動画・小部屋名は全会員ルームに共通で反映されます
        </p>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <AdminWatchLayoutSection />
        <AdminProgramRulesSection />
        <AdminWatchTopTitleSection />
        <AdminStudyRoomSection roomKey="study" />
        <AdminStudyRoomSection roomKey="study2" />

        {loading ? (
          <p className="text-center text-slate-500 py-12">読み込み中…</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Video size={18} className="text-indigo-600" />
                挨拶動画①（A / C / B・全会員共通）
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                全員に表示される共通の挨拶動画です。個人ごとに違う動画を見せたい場合は、各会員の部屋編集で②を上げてください。
              </p>
              <ul className="space-y-3">
                {(['A', 'C', 'B'] as GreetingSlot[]).map((slot) => {
                  const row = greetings[slot];
                  return (
                    <li key={slot} className="bg-white rounded-xl border p-4">
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm">
                          {slot}
                        </span>
                        <div className="flex-1 min-w-0 space-y-3">
                          <p className="text-xs text-indigo-700 font-bold">{GREETING_SLOT_HINTS[slot]}</p>
                          <div>
                            <label className="text-xs font-bold text-slate-500">表示タイトル</label>
                            <input
                              value={greetingTitles[slot] || ''}
                              onChange={(e) => setGreetingTitles((prev) => ({ ...prev, [slot]: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                              placeholder={DEFAULT_GREETING_TITLES[slot]}
                            />
                            <button
                              type="button"
                              disabled={greetingSaving === slot}
                              onClick={() => void handleGreetingTitleSave(slot)}
                              className="mt-2 inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                            >
                              <Save size={14} />
                              {greetingSaving === slot ? '保存中…' : 'タイトルを保存'}
                            </button>
                          </div>

                          {row?.storage_path ? (
                            <p className="text-xs text-slate-500">
                              登録済み: {formatSize(row.file_size)}
                              {row.uploaded_at && ` / ${new Date(row.uploaded_at).toLocaleDateString('ja-JP')}`}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-700 font-bold">まだ動画が登録されていません</p>
                          )}

                          <div>
                            <label className="text-xs font-bold text-slate-500">動画ファイル（mp4など）</label>
                            <input
                              type="file"
                              accept="video/*"
                              onChange={(e) =>
                                setGreetingFiles((prev) => ({
                                  ...prev,
                                  [slot]: e.target.files?.[0] || null,
                                }))
                              }
                              className="w-full mt-1 text-sm"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={greetingUploading === slot}
                              onClick={() => void handleGreetingUpload(slot)}
                              className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              <Upload size={14} />
                              {greetingUploading === slot ? 'アップロード中…' : row?.storage_path ? '動画を差し替え' : '動画をアップロード'}
                            </button>
                            {row?.storage_path && (
                              <button
                                type="button"
                                onClick={() => void handleGreetingDelete(slot)}
                                className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                                削除
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="font-bold text-slate-800">小部屋マスター（20枠）</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                ①〜⑫は番号付き、16〜20はダイエット枠（番号なし）、13〜15は下部枠（番号なし）です。
              </p>
              {[
                { label: 'カラダ改善プログラム（①〜⑫）', slots: Array.from({ length: 12 }, (_, i) => i + 1) },
                {
                  label: 'ダイエット枠（5つ・番号なし）',
                  slots: Array.from({ length: DIET_SUB_ROOM_COUNT }, (_, i) => DIET_SUB_ROOM_START + i),
                },
                { label: '下部枠（⑬〜⑮・番号なし）', slots: [13, 14, 15] },
              ].map((group) => (
                <div key={group.label} className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700">{group.label}</h3>
                  <ul className="space-y-3">
                    {group.slots.map((slot) => (
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
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
