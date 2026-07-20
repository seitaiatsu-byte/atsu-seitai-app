import { useEffect, useState } from 'react';
import { Trash2, Upload, Video } from 'lucide-react';
import {
  adminDeleteRoomGreetingOverride,
  adminListGreetingVideos,
  adminListRoomGreetingOverrides,
  adminUploadRoomGreetingOverride,
} from '../../lib/careApi';
import {
  DEFAULT_GREETING_TITLES,
  type GreetingSlot,
  type GreetingVideoRow,
  type RoomGreetingOverrideRow,
} from '../../lib/greetingVideos';

type Props = {
  roomId: string;
};

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SLOT_HINT: Record<GreetingSlot, string> = {
  A: '挨拶A',
  B: '挨拶B',
  C: '挨拶C',
};

export default function AdminRoomGreetingOverrideSection({ roomId }: Props) {
  const [master, setMaster] = useState<Record<GreetingSlot, GreetingVideoRow | null>>({
    A: null,
    B: null,
    C: null,
  });
  const [overrides, setOverrides] = useState<Record<GreetingSlot, RoomGreetingOverrideRow | null>>({
    A: null,
    B: null,
    C: null,
  });
  const [files, setFiles] = useState<Record<GreetingSlot, File | null>>({ A: null, B: null, C: null });
  const [titles, setTitles] = useState<Record<GreetingSlot, string>>({
    A: DEFAULT_GREETING_TITLES.A,
    B: DEFAULT_GREETING_TITLES.B,
    C: DEFAULT_GREETING_TITLES.C,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<GreetingSlot | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [greetingRows, overrideRows] = await Promise.all([
        adminListGreetingVideos(),
        adminListRoomGreetingOverrides(roomId),
      ]);
      const m: Record<GreetingSlot, GreetingVideoRow | null> = { A: null, B: null, C: null };
      const t: Record<GreetingSlot, string> = { ...DEFAULT_GREETING_TITLES };
      for (const row of greetingRows) {
        m[row.slot_code] = row;
        t[row.slot_code] = row.title;
      }
      const o: Record<GreetingSlot, RoomGreetingOverrideRow | null> = { A: null, B: null, C: null };
      for (const row of overrideRows) {
        o[row.slot_code] = row;
        if (row.title?.trim()) t[row.slot_code] = row.title;
      }
      setMaster(m);
      setOverrides(o);
      setTitles(t);
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [roomId]);

  const handleUpload = async (slot: GreetingSlot) => {
    const file = files[slot];
    if (!file) {
      alert('動画ファイルを選択してください');
      return;
    }
    setUploading(slot);
    try {
      await adminUploadRoomGreetingOverride(roomId, slot, file, titles[slot]);
      setFiles((prev) => ({ ...prev, [slot]: null }));
      await load();
      alert(`挨拶${slot}の個人動画②を保存しました。この会員にはマスター①の代わりに表示されます。`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (slot: GreetingSlot) => {
    if (!overrides[slot]?.storage_path) return;
    if (!window.confirm(`挨拶${slot}の個人動画②を削除しますか？削除後はマスター①が表示されます。`)) return;
    try {
      await adminDeleteRoomGreetingOverride(roomId, slot);
      await load();
      alert('削除しました。マスター①に戻ります。');
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">読み込み中…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <Video size={18} className="text-indigo-600" />
        挨拶動画②（この会員だけ上書き）
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        マスター設定の挨拶①が全員に表示されます。ここに②を上げると、この会員だけ②が優先表示されます。②を削除すると①に戻ります。
      </p>

      <ul className="space-y-3">
        {(['A', 'C', 'B'] as GreetingSlot[]).map((slot) => {
          const masterRow = master[slot];
          const overrideRow = overrides[slot];
          const hasOverride = Boolean(overrideRow?.storage_path && overrideRow.is_published);
          return (
            <li key={slot} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm">
                  {slot}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs font-bold text-indigo-700">{SLOT_HINT[slot]}</p>
                  <p className="text-xs text-slate-500">
                    ①マスター：
                    {masterRow?.storage_path && masterRow.is_published
                      ? `あり（${masterRow.title || DEFAULT_GREETING_TITLES[slot]}）`
                      : '未設定'}
                  </p>
                  <p className={`text-xs font-bold ${hasOverride ? 'text-teal-700' : 'text-slate-500'}`}>
                    ②この会員：{hasOverride ? `表示中（${formatSize(overrideRow?.file_size ?? null)}）` : 'なし → ①を表示'}
                  </p>
                  <div>
                    <label className="text-xs font-bold text-slate-500">②の表示タイトル</label>
                    <input
                      value={titles[slot] || ''}
                      onChange={(e) => setTitles((prev) => ({ ...prev, [slot]: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                      placeholder={DEFAULT_GREETING_TITLES[slot]}
                    />
                  </div>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => setFiles((prev) => ({ ...prev, [slot]: e.target.files?.[0] || null }))}
                    className="w-full text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploading === slot || !files[slot]}
                      onClick={() => void handleUpload(slot)}
                      className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <Upload size={14} />
                      {uploading === slot ? 'アップロード中…' : '②を保存'}
                    </button>
                    {hasOverride && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(slot)}
                        className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg border border-red-200 text-red-700"
                      >
                        <Trash2 size={14} />
                        ②を削除（①に戻す）
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
  );
}
