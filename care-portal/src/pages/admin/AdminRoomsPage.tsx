import { useEffect, useMemo, useState } from 'react';
import { Award, Copy, DoorOpen, LogOut, Plus, QrCode, Search, Trash2, X } from 'lucide-react';
import MemberRoomQrCard from '../../components/admin/MemberRoomQrCard';
import ProgramAccessPreview from '../../components/admin/ProgramAccessPreview';
import {
  adminCreateRoom,
  adminDeleteRoom,
  adminGetStudyRoomTitle,
  adminListGreetingVideos,
  adminListProgramDefs,
  adminListProgramRules,
  adminListRooms,
  adminListSubRoomMaster,
  adminListWatchLayout,
  adminSignOut,
  isStaffUser,
  type CareRoomRow,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot } from '../../lib/greetingVideos';
import { buildRoomCodeFromCustomerNumber } from '../../lib/memberGuide';
import {
  programTierShortLabel,
  type ProgramDef,
  type ProgramItemRule,
  type ProgramTier,
} from '../../lib/programTiers';
import { roomUrl } from '../../lib/session';
import { DEFAULT_STUDY2_ROOM_TITLE, DEFAULT_STUDY_ROOM_TITLE } from '../../lib/studyRoom';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT } from '../../lib/subRooms';
import type { WatchLayoutItemKey } from '../../lib/watchLayout';

type Props = {
  onOpenRoom: (roomId: string) => void;
  onOpenSubRoomsMaster: () => void;
  onLogout: () => void;
  onNeedLogin: () => void;
};

export default function AdminRoomsPage({
  onOpenRoom,
  onOpenSubRoomsMaster,
  onLogout,
  onNeedLogin,
}: Props) {
  const [rooms, setRooms] = useState<CareRoomRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [password, setPassword] = useState('');
  const [programTier, setProgramTier] = useState<ProgramTier>('E');
  const [programConfirmed, setProgramConfirmed] = useState(false);
  const [programRules, setProgramRules] = useState<ProgramItemRule[]>([]);
  const [programDefs, setProgramDefs] = useState<ProgramDef[]>([]);
  const [layoutKeys, setLayoutKeys] = useState<WatchLayoutItemKey[]>([]);
  const [studyTitle, setStudyTitle] = useState(DEFAULT_STUDY_ROOM_TITLE);
  const [study2Title, setStudy2Title] = useState(DEFAULT_STUDY2_ROOM_TITLE);
  const [greetingTitles, setGreetingTitles] = useState<Partial<Record<GreetingSlot, string>>>({});
  const [subRoomTitles, setSubRoomTitles] = useState<Record<number, string>>({});
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');
  const [qrRoom, setQrRoom] = useState<CareRoomRow | null>(null);
  const [redirectingLogin, setRedirectingLogin] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const staff = await isStaffUser();
      if (!staff) {
        setRedirectingLogin(true);
        try {
          await adminSignOut();
        } catch {
          /* ignore */
        }
        onNeedLogin();
        return;
      }
      const [roomRows, rules, defs, layout, study, study2, greetings, master] = await Promise.all([
        adminListRooms(),
        adminListProgramRules(),
        adminListProgramDefs(),
        adminListWatchLayout(),
        adminGetStudyRoomTitle('study'),
        adminGetStudyRoomTitle('study2'),
        adminListGreetingVideos(),
        adminListSubRoomMaster(),
      ]);
      setRooms(roomRows);
      setProgramRules(rules);
      setProgramDefs(defs);
      setLayoutKeys(layout);
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
      const message = err instanceof Error ? err.message : '読み込みに失敗しました';
      if (message.includes('スタッフ権限') || message.includes('staff only')) {
        setRedirectingLogin(true);
        try {
          await adminSignOut();
        } catch {
          /* ignore */
        }
        onNeedLogin();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.member_name.toLowerCase().includes(q) ||
        r.room_code.toLowerCase().includes(q) ||
        String(r.customer_number || '').includes(q)
    );
  }, [rooms, query]);

  const handleCreate = async () => {
    const name = memberName.trim();
    const customerNo = customerNumber.trim();
    const roomCode = buildRoomCodeFromCustomerNumber(customerNo) || customerNo.toLowerCase();
    const pass = password.trim();
    if (!name || !roomCode || !pass) {
      alert('会員氏名・顧客No.・パスワードは必須です');
      return;
    }
    if (pass.length < 4) {
      alert('パスワードは生月日4ケタで入力してください');
      return;
    }
    if (!programConfirmed) {
      alert('購入プログラムの開ける枠／鍵を確認し、チェックを入れてください');
      return;
    }
    setCreating(true);
    try {
      const id = await adminCreateRoom(name, roomCode, pass, customerNo, programTier);
      setShowCreate(false);
      setMemberName('');
      setCustomerNumber('');
      setPassword('');
      setProgramTier('E');
      setProgramConfirmed(false);
      await load();
      onOpenRoom(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoom = async (room: CareRoomRow) => {
    if (
      !window.confirm(
        `「${room.member_name}」のルームを削除しますか？\n登録済みの動画もすべて削除されます。`
      )
    ) {
      return;
    }
    try {
      await adminDeleteRoom(room.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      alert('コピーに失敗しました');
    }
  };

  const handleLogout = async () => {
    await adminSignOut();
    onLogout();
  };

  if (redirectingLogin || (loading && rooms.length === 0 && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <p className="text-slate-500 text-sm">
          {redirectingLogin ? 'ログイン画面へ移動しています…' : '読み込み中…'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-indigo-700 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold">会員ルーム管理</h1>
          <p className="text-xs text-indigo-200">{rooms.length} 部屋</p>
        </div>
        <button type="button" onClick={() => void handleLogout()} className="p-2 rounded-lg hover:bg-indigo-600">
          <LogOut size={18} />
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <button
          type="button"
          onClick={onOpenSubRoomsMaster}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 border-2 border-amber-600 text-amber-950 font-black text-base sm:text-lg px-4 py-4 rounded-2xl shadow-md shadow-amber-300/60 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 active:scale-[0.99] transition"
        >
          <span className="shrink-0 w-11 h-11 rounded-full bg-white/90 border-2 border-amber-600 flex items-center justify-center shadow-sm">
            <Award size={26} className="text-amber-600 fill-amber-300" strokeWidth={2.25} />
          </span>
          <span className="flex-1 text-left leading-snug">会員の部屋を編集するページへいく</span>
        </button>

        {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{error}</div>}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="氏名・部屋コード・顧客番号"
              className="w-full pl-9 pr-3 py-2 rounded-xl border bg-white"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="shrink-0 flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl"
          >
            <Plus size={18} />
            新規
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-2xl border p-4 space-y-3">
            <h2 className="font-bold text-slate-800">新しい会員ルーム</h2>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">会員氏名</label>
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="会員氏名"
                className="w-full px-3 py-2 rounded-lg border"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">顧客No.（部屋コード）</label>
              <input
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder="例：1234"
                className="w-full px-3 py-2 rounded-lg border font-mono"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">パスワード</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="例：0319"
                className="w-full px-3 py-2 rounded-lg border font-mono"
                inputMode="numeric"
              />
              <p className="text-xs text-slate-500 mt-1">生月日 4ケタを入れる</p>
            </div>
            <ProgramAccessPreview
              programTier={programTier}
              onChange={(tier) => {
                setProgramTier(tier);
                setProgramConfirmed(false);
              }}
              rules={programRules}
              defs={programDefs}
              layoutKeys={layoutKeys}
              studyTitle={studyTitle}
              study2Title={study2Title}
              greetingTitles={greetingTitles}
              subRoomTitles={subRoomTitles}
              requireConfirm
              confirmed={programConfirmed}
              onConfirmedChange={setProgramConfirmed}
            />
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl"
            >
              {creating ? '作成中…' : 'ルームを作成'}
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-center text-slate-500 py-8">読み込み中…</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => {
              const url = roomUrl(r.room_code);
              return (
                <li key={r.id} className="bg-white rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{r.member_name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{r.room_code}</p>
                      {r.customer_number && (
                        <p className="text-xs text-slate-500">顧客番号: {r.customer_number}</p>
                      )}
                      <p className="text-xs text-indigo-700 font-bold mt-1">
                        プログラム: {programTierShortLabel(r.program_tier, programDefs)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        パス更新: {new Date(r.password_updated_at).toLocaleDateString('ja-JP')}
                        {r.next_password_rotation_at
                          ? ` ／ 次回自動: ${new Date(r.next_password_rotation_at).toLocaleDateString('ja-JP')}`
                          : ''}
                        {!r.is_active && <span className="ml-2 text-red-600 font-bold">停止中</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenRoom(r.id)}
                      className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-sm hover:bg-indigo-100"
                    >
                      <DoorOpen size={16} />
                      開く
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setQrRoom(r)}
                      className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 font-bold"
                    >
                      <QrCode size={12} />
                      QR
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(r.id, url)}
                      className="text-xs flex items-center gap-1 px-2 py-1 rounded border hover:bg-slate-50"
                    >
                      <Copy size={12} />
                      {copied === r.id ? 'コピー済' : 'URLコピー'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRoom(r)}
                      className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 font-bold"
                    >
                      <Trash2 size={12} />
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {qrRoom && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setQrRoom(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-3 rounded-t-2xl">
              <p className="font-bold text-slate-800">{qrRoom.member_name} さんのQR</p>
              <button
                type="button"
                onClick={() => setQrRoom(null)}
                className="p-2 rounded-lg hover:bg-slate-100"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <MemberRoomQrCard memberName={qrRoom.member_name} roomCode={qrRoom.room_code} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
