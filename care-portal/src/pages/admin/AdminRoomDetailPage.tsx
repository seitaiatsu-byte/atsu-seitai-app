import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, KeyRound, Pencil, Printer, Save, Trash2, Upload, Video } from 'lucide-react';
import AdminRoomGreetingOverrideSection from '../../components/admin/AdminRoomGreetingOverrideSection';
import AdminStudyRoomSection from '../../components/admin/AdminStudyRoomSection';
import MemberRoomQrCard from '../../components/admin/MemberRoomQrCard';
import ProgramAccessPreview from '../../components/admin/ProgramAccessPreview';
import {
  adminDeleteRoom,
  adminDeleteVideo,
  adminGetStudyRoomTitle,
  adminListGreetingVideos,
  adminListProgramDefs,
  adminListProgramRules,
  adminListRoomVideos,
  adminListRooms,
  adminListSubRoomMaster,
  adminListWatchLayout,
  adminSetRoomPassword,
  adminStartRoomPreview,
  adminToggleVideoPublish,
  adminUpdateRoom,
  adminUpdateVideoMeta,
  adminUpdateVideoSubRoom,
  adminUploadVideo,
  type CareRoomRow,
  type CareRoomVideoRow,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot } from '../../lib/greetingVideos';
import { buildRoomCodeFromCustomerNumber } from '../../lib/memberGuide';
import { type ProgramDef, type ProgramItemRule, type ProgramTier } from '../../lib/programTiers';
import { saveSession } from '../../lib/session';
import { DEFAULT_STUDY2_ROOM_TITLE, DEFAULT_STUDY_ROOM_TITLE } from '../../lib/studyRoom';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT } from '../../lib/subRooms';
import type { WatchLayoutItemKey } from '../../lib/watchLayout';

type Props = {
  roomId: string;
  onBack: () => void;
  onPreviewMemberRoom?: () => void;
};

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminRoomDetailPage({ roomId, onBack, onPreviewMemberRoom }: Props) {
  const [room, setRoom] = useState<CareRoomRow | null>(null);
  const [videos, setVideos] = useState<CareRoomVideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [editMemberName, setEditMemberName] = useState('');
  const [editCustomerNumber, setEditCustomerNumber] = useState('');
  const [editRoomCode, setEditRoomCode] = useState('');
  const [editProgramTier, setEditProgramTier] = useState<ProgramTier>('E');
  const [programConfirmed, setProgramConfirmed] = useState(false);
  const [programRules, setProgramRules] = useState<ProgramItemRule[]>([]);
  const [programDefs, setProgramDefs] = useState<ProgramDef[]>([]);
  const [layoutKeys, setLayoutKeys] = useState<WatchLayoutItemKey[]>([]);
  const [studyTitle, setStudyTitle] = useState(DEFAULT_STUDY_ROOM_TITLE);
  const [study2Title, setStudy2Title] = useState(DEFAULT_STUDY2_ROOM_TITLE);
  const [greetingTitles, setGreetingTitles] = useState<Partial<Record<GreetingSlot, string>>>({});
  const [savingRoom, setSavingRoom] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadSlot, setUploadSlot] = useState(1);
  const [subRoomTitles, setSubRoomTitles] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editVideoTitle, setEditVideoTitle] = useState('');
  const [editVideoDescription, setEditVideoDescription] = useState('');
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rooms, master, rules, defs, layout, study, study2, greetings] = await Promise.all([
        adminListRooms(),
        adminListSubRoomMaster(),
        adminListProgramRules(),
        adminListProgramDefs(),
        adminListWatchLayout(),
        adminGetStudyRoomTitle('study'),
        adminGetStudyRoomTitle('study2'),
        adminListGreetingVideos(),
      ]);
      const found = rooms.find((r) => r.id === roomId) || null;
      setRoom(found);
      if (found) {
        setEditMemberName(found.member_name);
        setEditCustomerNumber(found.customer_number || '');
        setEditRoomCode(found.room_code);
        setEditProgramTier(found.program_tier || 'E');
        setProgramConfirmed(false);
      }
      setVideos(await adminListRoomVideos(roomId));
      setProgramRules(rules);
      setProgramDefs(defs);
      setLayoutKeys(layout);
      setStudyTitle(study);
      setStudy2Title(study2);
      const gTitles: Partial<Record<GreetingSlot, string>> = { ...DEFAULT_GREETING_TITLES };
      for (const g of greetings) gTitles[g.slot_code] = g.title;
      setGreetingTitles(gTitles);
      const titles: Record<number, string> = { ...DEFAULT_SUB_ROOM_TITLES };
      for (const m of master) titles[m.slot_number] = m.title;
      for (let i = 1; i <= SUB_ROOM_COUNT; i++) {
        if (!titles[i]) titles[i] = `小部屋${i}`;
      }
      setSubRoomTitles(titles);
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [roomId]);

  const handleSaveRoom = async () => {
    if (!editMemberName.trim()) {
      alert('会員氏名を入力してください');
      return;
    }
    if (!editRoomCode.trim()) {
      alert('部屋コードを入力してください');
      return;
    }
    const tierChanged = room?.program_tier !== editProgramTier;
    if (tierChanged && !programConfirmed) {
      alert('購入プログラムを変更する場合は、開ける枠／鍵を確認してチェックを入れてください');
      return;
    }
    setSavingRoom(true);
    try {
      await adminUpdateRoom(roomId, {
        member_name: editMemberName.trim(),
        customer_number: editCustomerNumber.trim() || null,
        room_code: editRoomCode.trim().toLowerCase(),
        program_tier: editProgramTier,
      });
      await load();
      alert('会員情報を保存しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSavingRoom(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!room) return;
    if (
      !window.confirm(
        `「${room.member_name}」のルームを完全に削除しますか？\n登録済みの動画もすべて削除されます。`
      )
    ) {
      return;
    }
    setDeletingRoom(true);
    try {
      await adminDeleteRoom(roomId);
      alert('ルームを削除しました');
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeletingRoom(false);
    }
  };

  const handleCustomerNumberChange = (value: string) => {
    setEditCustomerNumber(value);
    const code = buildRoomCodeFromCustomerNumber(value);
    if (code) setEditRoomCode(code);
  };

  const handlePreviewMemberRoom = async () => {
    setPreviewing(true);
    try {
      const session = await adminStartRoomPreview(roomId);
      saveSession(session);
      if (onPreviewMemberRoom) {
        onPreviewMemberRoom();
      } else {
        window.location.href = '/watch';
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '会員部屋の確認を開始できませんでした');
    } finally {
      setPreviewing(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword.trim() || newPassword.trim().length < 4) {
      alert('入室パスは4文字以上にしてください');
      return;
    }
    if (!window.confirm('入室パスを変更すると、会員の既存セッションは無効になります。よろしいですか？')) return;
    try {
      await adminSetRoomPassword(roomId, newPassword.trim());
      setNewPassword('');
      await load();
      alert('入室パスを変更しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '変更に失敗しました');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('動画ファイルを選択してください');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      alert('ファイルは500MB以下にしてください');
      return;
    }
    setUploading(true);
    try {
      await adminUploadVideo(roomId, file, { title, description, subRoomSlot: uploadSlot });
      setFile(null);
      setTitle('');
      setDescription('');
      await load();
      alert('アップロードしました');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!room) return;
    const next = !room.is_active;
    if (!next && !window.confirm('このルームを停止しますか？会員は入室できなくなります。')) return;
    try {
      await adminUpdateRoom(roomId, { is_active: next });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新に失敗しました');
    }
  };

  const startEditVideo = (video: CareRoomVideoRow) => {
    setEditingVideoId(video.id);
    setEditVideoTitle(video.title);
    setEditVideoDescription(video.description || '');
  };

  const cancelEditVideo = () => {
    setEditingVideoId(null);
    setEditVideoTitle('');
    setEditVideoDescription('');
  };

  const handleSaveVideo = async (videoId: string) => {
    setSavingVideoId(videoId);
    try {
      await adminUpdateVideoMeta(videoId, {
        title: editVideoTitle,
        description: editVideoDescription,
      });
      cancelEditVideo();
      await load();
      alert('動画情報を保存しました');
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSavingVideoId(null);
    }
  };

  if (loading) {
    return <p className="text-center py-12 text-slate-500">読み込み中…</p>;
  }

  if (!room) {
    return (
      <div className="p-6 text-center">
        <p>ルームが見つかりません</p>
        <button type="button" onClick={onBack} className="mt-4 underline">
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <header className="bg-indigo-700 text-white px-4 py-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-indigo-200 mb-1">
          <ArrowLeft size={16} />
          一覧へ
        </button>
        <h1 className="font-bold text-lg">{room.member_name}</h1>
        <p className="text-xs text-indigo-200 font-mono">{room.room_code}</p>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <section className="bg-white rounded-2xl border p-4 space-y-3">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Pencil size={18} />
            会員情報の編集
          </h2>
          <p className="text-xs text-slate-500">
            氏名を変更すると、会員が「更新する」を押したときに表示名も変わります。
          </p>
          <label className="text-xs font-bold text-slate-500">会員氏名</label>
          <input
            value={editMemberName}
            onChange={(e) => setEditMemberName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border"
            placeholder="会員氏名"
          />
          <label className="text-xs font-bold text-slate-500">顧客番号</label>
          <input
            value={editCustomerNumber}
            onChange={(e) => handleCustomerNumberChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border"
            placeholder="例：1234"
          />
          <label className="text-xs font-bold text-slate-500">部屋コード（URLに使われます）</label>
          <input
            value={editRoomCode}
            onChange={(e) => setEditRoomCode(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border font-mono text-sm"
            placeholder="例：1234"
          />
          <ProgramAccessPreview
            programTier={editProgramTier}
            onChange={(tier) => {
              setEditProgramTier(tier);
              setProgramConfirmed(false);
            }}
            rules={programRules}
            defs={programDefs}
            layoutKeys={layoutKeys}
            studyTitle={studyTitle}
            study2Title={study2Title}
            greetingTitles={greetingTitles}
            subRoomTitles={subRoomTitles}
            requireConfirm={room.program_tier !== editProgramTier}
            confirmed={programConfirmed}
            onConfirmedChange={setProgramConfirmed}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={savingRoom}
              onClick={() => void handleSaveRoom()}
              className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Save size={14} />
              {savingRoom ? '保存中…' : '会員情報を保存'}
            </button>
            <button
              type="button"
              disabled={previewing}
              onClick={() => void handlePreviewMemberRoom()}
              className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Eye size={14} />
              {previewing ? '開いています…' : '会員さんの部屋を確認'}
            </button>
            <button
              type="button"
              disabled={deletingRoom}
              onClick={() => void handleDeleteRoom()}
              className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deletingRoom ? '削除中…' : 'ルームを削除'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl border p-4 space-y-4">
          <h2 className="font-bold text-slate-800">会員に渡す情報</h2>
          <MemberRoomQrCard memberName={room.member_name} roomCode={room.room_code} />
          <p className="text-xs text-slate-500">
            入室パス最終更新: {new Date(room.password_updated_at).toLocaleString('ja-JP')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/guide?member=${encodeURIComponent(room.member_name)}&room=${encodeURIComponent(room.room_code)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
            >
              <Printer size={16} />
              会員用案内を印刷
            </a>
            <button
              type="button"
              onClick={() => void handleToggleActive()}
              className={`text-sm font-bold px-3 py-1.5 rounded-lg ${
                room.is_active ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
              }`}
            >
              {room.is_active ? 'ルームを停止する' : 'ルームを有効にする'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl border p-4">
          <h2 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <KeyRound size={18} />
            入室パス変更
          </h2>
          <p className="text-xs text-slate-500 mb-2">変更すると会員は新しいパスで再入室が必要です（既存セッションは無効化）</p>
          <div className="flex gap-2">
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しい入室パス"
              className="flex-1 px-3 py-2 rounded-lg border"
            />
            <button
              type="button"
              onClick={() => void handlePasswordChange()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm"
            >
              変更
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl border p-4 space-y-6">
          <AdminStudyRoomSection roomKey="study" memberRoomId={roomId} />
          <div className="border-t pt-6">
            <AdminStudyRoomSection roomKey="study2" memberRoomId={roomId} />
          </div>
        </section>

        <section className="bg-white rounded-2xl border p-4">
          <AdminRoomGreetingOverrideSection roomId={roomId} />
        </section>

        <section className="bg-white rounded-2xl border p-4">
          <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Upload size={18} />
            動画アップロード
          </h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル（空ならファイル名）"
            className="w-full px-3 py-2 rounded-lg border mb-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="メモ（任意）"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border mb-2 resize-none"
          />
          <label className="block text-xs font-bold text-slate-600 mb-1">入れる小部屋（1〜20）</label>
          <select
            value={uploadSlot}
            onChange={(e) => setUploadSlot(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border mb-3 text-sm"
          >
            {Array.from({ length: SUB_ROOM_COUNT }, (_, i) => i + 1).map((slot) => (
              <option key={slot} value={slot}>
                {slot}. {subRoomTitles[slot]}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm mb-3"
          />
          <button
            type="button"
            disabled={uploading || !file}
            onClick={() => void handleUpload()}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl"
          >
            {uploading ? 'アップロード中…' : 'この部屋に動画を追加'}
          </button>
          <p className="text-xs text-slate-500 mt-2">MP4推奨・最大500MB・5〜8分想定</p>
        </section>

        <section className="bg-white rounded-2xl border p-4">
          <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Video size={18} />
            動画一覧（{videos.length}本）
          </h2>
          {videos.length === 0 ? (
            <p className="text-sm text-slate-500">まだ動画がありません</p>
          ) : (
            <ul className="space-y-3">
              {videos.map((v) => (
                <li key={v.id} className="border rounded-xl p-3">
                  {editingVideoId === v.id ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">タイトル</label>
                      <input
                        value={editVideoTitle}
                        onChange={(e) => setEditVideoTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                      />
                      <label className="text-xs font-bold text-slate-500">メモ</label>
                      <textarea
                        value={editVideoDescription}
                        onChange={(e) => setEditVideoDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingVideoId === v.id}
                          onClick={() => void handleSaveVideo(v.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-600 text-white"
                        >
                          <Save size={12} />
                          {savingVideoId === v.id ? '保存中…' : '保存'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditVideo}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800">{v.title}</p>
                        {v.description && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{v.description}</p>}
                        <p className="text-xs text-slate-500 mt-1">
                          小部屋{v.sub_room_slot ?? 1} · {subRoomTitles[v.sub_room_slot ?? 1] ?? ''} ·{' '}
                          {new Date(v.uploaded_at).toLocaleDateString('ja-JP')} · {formatSize(v.file_size)}
                          {!v.is_published && <span className="ml-2 text-amber-700 font-bold">非公開</span>}
                        </p>
                        <select
                          value={v.sub_room_slot ?? 1}
                          onChange={(e) =>
                            void adminUpdateVideoSubRoom(v.id, Number(e.target.value))
                              .then(load)
                              .catch((err) => alert(err instanceof Error ? err.message : '移動に失敗'))
                          }
                          className="mt-2 text-xs px-2 py-1 rounded border max-w-full"
                        >
                          {Array.from({ length: SUB_ROOM_COUNT }, (_, i) => i + 1).map((slot) => (
                            <option key={slot} value={slot}>
                              小部屋{slot}: {subRoomTitles[slot]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditVideo(v)}
                          className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1"
                        >
                          <Pencil size={12} />
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void adminToggleVideoPublish(v.id, !v.is_published).then(load).catch((e) => alert(e.message))
                          }
                          className="text-xs px-2 py-1 rounded border"
                        >
                          {v.is_published ? '非公開' : '公開'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`「${v.title}」を削除しますか？`)) return;
                            void adminDeleteVideo(v).then(load).catch((e) => alert(e.message));
                          }}
                          className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 inline-flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
