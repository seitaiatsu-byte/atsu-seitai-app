import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, ExternalLink, FileText, Image, Pencil, Save, Trash2, Upload } from 'lucide-react';
import {
  adminCreateStudyLink,
  adminDeleteStudyItem,
  adminGetStudyRoomTitle,
  adminListStudyItems,
  adminMoveStudyItem,
  adminUpdateStudyItem,
  adminUpdateStudyRoomTitle,
  adminUploadStudyFile,
} from '../../lib/careApi';
import {
  defaultStudyRoomTitle,
  studyItemTypeLabel,
  type StudyItemRow,
  type StudyItemType,
  type StudyRoomKey,
} from '../../lib/studyRoom';

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  roomKey?: StudyRoomKey;
  /** 指定すると個人部屋専用の資料のみ編集（マスター共通は触らない） */
  memberRoomId?: string;
};

export default function AdminStudyRoomSection({ roomKey = 'study', memberRoomId }: Props) {
  const defaultTitle = defaultStudyRoomTitle(roomKey);
  const isRoomScoped = Boolean(memberRoomId);
  const sectionLabel = isRoomScoped
    ? roomKey === 'study2'
      ? 'この会員の勉強部屋②に資料を追加'
      : 'この会員の勉強部屋①に資料を追加'
    : roomKey === 'study2'
      ? '勉強部屋②（赤いアイコン）'
      : '健康への勉強部屋（最上部）';
  const [roomTitle, setRoomTitle] = useState(defaultTitle);
  const [items, setItems] = useState<StudyItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTitle, setSavingTitle] = useState(false);
  const [newType, setNewType] = useState<StudyItemType>('link');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [title, list] = await Promise.all([
        adminGetStudyRoomTitle(roomKey),
        adminListStudyItems(roomKey, memberRoomId || null),
      ]);
      setRoomTitle(title);
      setItems(list);
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [roomKey, memberRoomId]);

  const handleSaveTitle = async () => {
    setSavingTitle(true);
    try {
      await adminUpdateStudyRoomTitle(roomKey, roomTitle);
      alert('勉強部屋の名前を保存しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      if (newType === 'link') {
        await adminCreateStudyLink(roomKey, newTitle, newUrl, memberRoomId || null);
      } else {
        if (!newFile) {
          alert('ファイルを選択してください');
          return;
        }
        await adminUploadStudyFile(roomKey, newType, newTitle, newFile, memberRoomId || null);
      }
      setNewTitle('');
      setNewUrl('');
      setNewFile(null);
      await load();
      alert('資料を追加しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: StudyItemRow) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditUrl(item.external_url || '');
  };

  const handleSaveEdit = async (item: StudyItemRow) => {
    try {
      await adminUpdateStudyItem(item.id, {
        title: editTitle,
        external_url: item.item_type === 'link' ? editUrl : undefined,
      });
      setEditingId(null);
      await load();
      alert('保存しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">読み込み中…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <BookOpen size={18} className="text-rose-500" />
        {sectionLabel}
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        {isRoomScoped
          ? 'ここに追加した資料は、この会員の部屋だけに表示されます（マスター共通の資料はそのまま残ります）。'
          : roomKey === 'study2'
            ? '会員画面で赤い本アイコンの2つ目の部屋として表示されます。名前・資料はここから編集できます（全院共通）。'
            : '会員の部屋一覧のいちばん上に表示されます。計画書・プログラムの目的・記事URLなどを置けます（全院共通）。'}
      </p>

      {!isRoomScoped && (
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <label className="text-xs font-bold text-slate-500">部屋の名前</label>
        <input
          value={roomTitle}
          onChange={(e) => setRoomTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          placeholder={defaultTitle}
        />
        <button
          type="button"
          disabled={savingTitle}
          onClick={() => void handleSaveTitle()}
          className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <Save size={14} />
          {savingTitle ? '保存中…' : '名前を保存'}
        </button>
      </div>
      )}

      {isRoomScoped && (
        <p className="text-xs text-slate-600 bg-slate-50 border rounded-lg px-3 py-2">
          部屋名（共通）：<span className="font-bold">{roomTitle}</span>
        </p>
      )}

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-700">資料を追加</h3>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { type: 'link' as const, label: 'リンク', icon: ExternalLink },
              { type: 'image' as const, label: '画像', icon: Image },
              { type: 'pdf' as const, label: 'PDF', icon: FileText },
            ] as const
          ).map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setNewType(type)}
              className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border ${
                newType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="タイトル（例：プログラムの目的）"
          className="w-full px-3 py-2 rounded-lg border text-sm"
        />
        {newType === 'link' ? (
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
          />
        ) : (
          <input
            type="file"
            accept={newType === 'pdf' ? 'application/pdf,.pdf' : 'image/jpeg,image/png,image/webp,image/gif'}
            onChange={(e) => setNewFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        )}
        <button
          type="button"
          disabled={adding}
          onClick={() => void handleAdd()}
          className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Upload size={14} />
          {adding ? '追加中…' : 'この資料を追加'}
        </button>
      </div>

      <ul className="space-y-3">
        {items.length === 0 ? (
          <li className="bg-white rounded-xl border p-4 text-sm text-slate-500">まだ資料がありません</li>
        ) : (
          items.map((item, index) => (
            <li key={item.id} className="bg-white rounded-xl border p-4 space-y-2">
              {editingId === item.id ? (
                <>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                  />
                  {item.item_type === 'link' && (
                    <input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(item)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-600 text-white"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                    >
                      キャンセル
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-indigo-700">{studyItemTypeLabel(item.item_type)}</p>
                      <p className="font-bold text-slate-800 mt-0.5">{item.title}</p>
                      {item.item_type === 'link' && item.external_url && (
                        <p className="text-xs text-slate-500 mt-1 break-all">{item.external_url}</p>
                      )}
                      {item.storage_path && (
                        <p className="text-xs text-slate-500 mt-1">{formatSize(item.file_size)}</p>
                      )}
                      {!item.is_published && (
                        <p className="text-xs text-amber-700 font-bold mt-1">非公開</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void adminMoveStudyItem(roomKey, item.id, 'up', memberRoomId || null).then(load)}
                        className="text-xs px-2 py-1 rounded border disabled:opacity-30"
                        title="上へ"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={index === items.length - 1}
                        onClick={() => void adminMoveStudyItem(roomKey, item.id, 'down', memberRoomId || null).then(load)}
                        className="text-xs px-2 py-1 rounded border disabled:opacity-30"
                        title="下へ"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border"
                    >
                      <Pencil size={12} />
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void adminUpdateStudyItem(item.id, { is_published: !item.is_published })
                          .then(load)
                          .catch((e) => alert(e.message))
                      }
                      className="text-xs font-bold px-2 py-1 rounded border"
                    >
                      {item.is_published ? '非公開' : '公開'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`「${item.title}」を削除しますか？`)) return;
                        void adminDeleteStudyItem(item)
                          .then(load)
                          .catch((e) => alert(e.message));
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border border-red-200 text-red-700"
                    >
                      <Trash2 size={12} />
                      削除
                    </button>
                  </div>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
