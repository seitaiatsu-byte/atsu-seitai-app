import { useEffect, useState } from 'react';
import { Save, Trash2, Upload, Video } from 'lucide-react';
import AdminPageHeader from '../../components/layout/AdminPageHeader';
import AdminProgramRulesSection from '../../components/admin/AdminProgramRulesSection';
import AdminStudyRoomSection from '../../components/admin/AdminStudyRoomSection';
import AdminWatchLayoutSection from '../../components/admin/AdminWatchLayoutSection';
import AdminWatchTopTitleSection from '../../components/admin/AdminWatchTopTitleSection';
import {
  adminDeleteGreetingVideo,
  adminListGreetingVideos,
  adminListSubRoomMaster,
  adminSignOut,
  adminUpdateGreetingTitle,
  adminUpdateSubRoomTitle,
  adminUploadGreetingVideo,
  isStaffUser,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot, type GreetingVideoRow } from '../../lib/greetingVideos';
import {
  DEFAULT_SUB_ROOM_TITLES,
  DIET_SUB_ROOM_COUNT,
  DIET_SUB_ROOM_START,
  SUB_ROOM_COUNT,
  encodeSubRoomTitle,
  parseSubRoomTitle,
  type SubRoomTitleAlign,
} from '../../lib/subRooms';

const GREETING_SLOT_HINTS: Record<GreetingSlot, string> = {
  A: '部屋トップに表示',
  B: '一番下・ダイエット枠の直前に表示',
  C: '⑫の直後・⑬⑭⑮の直前に表示',
};

type Props = {
  onBack: () => void;
  onNeedLogin?: () => void;
};

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminSubRoomsMasterPage({ onBack, onNeedLogin }: Props) {
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
  const [layoutRefreshKey, setLayoutRefreshKey] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const staff = await isStaffUser();
      if (!staff) {
        try {
          await adminSignOut();
        } catch {
          /* ignore */
        }
        onNeedLogin?.();
        return;
      }
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
      const message = err instanceof Error ? err.message : '読み込みに失敗しました';
      if (message.includes('スタッフ権限') || message.includes('staff only')) {
        try {
          await adminSignOut();
        } catch {
          /* ignore */
        }
        onNeedLogin?.();
        return;
      }
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (slot: number) => {
    const parsed = parseSubRoomTitle(titles[slot] || '');
    if (!parsed.text.trim()) {
      alert('タイトルを入力してください');
      return;
    }
    const title = encodeSubRoomTitle(parsed.align, parsed.text);
    setSaving(slot);
    try {
      await adminUpdateSubRoomTitle(slot, title);
      setTitles((prev) => ({ ...prev, [slot]: title }));
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
      setLayoutRefreshKey((n) => n + 1);
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
      <AdminPageHeader
        onBack={onBack}
        title="マスター設定"
        subtitle="表示順・プログラムA〜E・鍵ルール・勉強部屋・挨拶動画・小部屋名は全会員ルームに共通で反映されます"
      />

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <AdminWatchLayoutSection key={`layout-${layoutRefreshKey}`} />
        <AdminProgramRulesSection key={`rules-${layoutRefreshKey}`} />
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
                挨拶動画①（A / B / C・全会員共通）
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                全員に表示される共通の挨拶動画です。個人ごとに違う動画を見せたい場合は、各会員の部屋編集で②を上げてください。
              </p>
              <ul className="space-y-3">
                {(['A', 'B', 'C'] as GreetingSlot[]).map((slot) => {
                  const row = greetings[slot];
                  const title = (greetingTitles[slot] || DEFAULT_GREETING_TITLES[slot] || '').trim();
                  const bare = `挨拶動画${slot}`;
                  const heading = title && title !== bare ? `${bare}（${title}）` : bare;
                  return (
                    <li key={slot} className="bg-white rounded-xl border p-4">
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm">
                          {slot}
                        </span>
                        <div className="flex-1 min-w-0 space-y-3">
                          <p className="text-sm font-bold text-indigo-800">{heading}</p>
                          <p className="text-xs text-slate-500">{GREETING_SLOT_HINTS[slot]}</p>
                          <div>
                            <label className="text-xs font-bold text-slate-500">
                              表示タイトル（最大3行・Enterで改行）
                            </label>
                            <textarea
                              value={greetingTitles[slot] || ''}
                              onChange={(e) => setGreetingTitles((prev) => ({ ...prev, [slot]: e.target.value }))}
                              rows={3}
                              className="w-full mt-1 px-3 py-2 rounded-lg border text-sm leading-relaxed resize-y"
                              placeholder={`あいさつ動画\n${DEFAULT_GREETING_TITLES[slot]}`}
                            />
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                              1行目は細め、2〜3行目は太字で表示されます。例：1行目「あいさつ動画」
                            </p>
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
                            <label className="text-xs font-bold text-slate-500">
                              動画ファイル（mp4 / mov など・最大500MB）
                            </label>
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
                            {greetingFiles[slot] ? (
                              <p className="text-[11px] text-slate-600 mt-1">
                                選択中: {greetingFiles[slot]!.name}（
                                {(greetingFiles[slot]!.size / (1024 * 1024)).toFixed(1)}MB）
                              </p>
                            ) : null}
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
                ①〜⑫は番号付き、13〜15は補足講義枠（番号なし）、16〜20はダイエット枠（一番下・番号なし）です。
              </p>
              {[
                { label: 'カラダ改善プログラム（①〜⑫）', slots: Array.from({ length: 12 }, (_, i) => i + 1) },
                { label: '補足講義枠（⑬〜⑮・番号なし）', slots: [13, 14, 15] },
                {
                  label: 'ダイエット枠（5つ・一番下・番号なし）',
                  slots: Array.from({ length: DIET_SUB_ROOM_COUNT }, (_, i) => DIET_SUB_ROOM_START + i),
                },
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
                            <label className="text-xs font-bold text-slate-500">小部屋の名前（改行・寄せ可）</label>
                            {(() => {
                              const parsed = parseSubRoomTitle(titles[slot] || '');
                              return (
                                <>
                                  <div className="flex flex-wrap gap-2">
                                    {(
                                      [
                                        { value: 'left', label: '左寄せ' },
                                        { value: 'center', label: '中央' },
                                        { value: 'right', label: '右寄せ' },
                                      ] as const
                                    ).map((opt) => (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() =>
                                          setTitles((prev) => ({
                                            ...prev,
                                            [slot]: encodeSubRoomTitle(opt.value, parsed.text),
                                          }))
                                        }
                                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                                          parsed.align === opt.value
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                  <textarea
                                    value={parsed.text}
                                    onChange={(e) =>
                                      setTitles((prev) => ({
                                        ...prev,
                                        [slot]: encodeSubRoomTitle(
                                          parsed.align as SubRoomTitleAlign,
                                          e.target.value
                                        ),
                                      }))
                                    }
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg border text-sm leading-relaxed resize-y"
                                    placeholder={`小部屋${slot}\n2行目はEnterで改行`}
                                  />
                                  <p className="text-[11px] text-slate-500 leading-relaxed">
                                    Enterで改行、全角スペースで字間調整できます。端末幅で折り返し位置は変わります。
                                  </p>
                                </>
                              );
                            })()}
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
