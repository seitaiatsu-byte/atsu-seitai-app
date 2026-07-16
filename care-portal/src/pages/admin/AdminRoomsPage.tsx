import { useEffect, useMemo, useState } from 'react';
import { Copy, DoorOpen, LogOut, Plus, QrCode, Search, X } from 'lucide-react';
import MemberRoomQrCard from '../../components/admin/MemberRoomQrCard';
import {
  adminCreateRoom,
  adminListRooms,
  adminSignOut,
  isStaffUser,
  type CareRoomRow,
} from '../../lib/careApi';
import { buildPasswordFromBirthMonthDay, buildRoomCodeFromCustomerNumber, STAFF_ROOM_CONVENTION } from '../../lib/memberGuide';
import { roomUrl } from '../../lib/session';

type Props = {
  onOpenRoom: (roomId: string) => void;
  onLogout: () => void;
};

export default function AdminRoomsPage({ onOpenRoom, onLogout }: Props) {
  const [rooms, setRooms] = useState<CareRoomRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');
  const [qrRoom, setQrRoom] = useState<CareRoomRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const staff = await isStaffUser();
      if (!staff) throw new Error('スタッフ権限がありません');
      setRooms(await adminListRooms());
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
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

  const handleCustomerNumberChange = (value: string) => {
    setCustomerNumber(value);
    const code = buildRoomCodeFromCustomerNumber(value);
    if (code) setRoomCode(code);
  };

  const applyBirthPassword = () => {
    const month = Number(birthMonth);
    const day = Number(birthDay);
    const pass = buildPasswordFromBirthMonthDay(month, day);
    if (pass) setPassword(pass);
  };

  const handleCreate = async () => {
    if (!memberName.trim() || !roomCode.trim() || !password.trim()) {
      alert('氏名・部屋コード・入室パスは必須です');
      return;
    }
    setCreating(true);
    try {
      const id = await adminCreateRoom(memberName.trim(), roomCode.trim(), password.trim(), customerNumber.trim());
      setShowCreate(false);
      setMemberName('');
      setRoomCode('');
      setPassword('');
      setCustomerNumber('');
      setBirthMonth('');
      setBirthDay('');
      await load();
      onOpenRoom(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setCreating(false);
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
            <p className="text-xs text-slate-500 leading-relaxed">{STAFF_ROOM_CONVENTION.note}</p>
            <input
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="会員氏名"
              className="w-full px-3 py-2 rounded-lg border"
            />
            <input
              value={customerNumber}
              onChange={(e) => handleCustomerNumberChange(e.target.value)}
              placeholder="顧客番号（例：1234）"
              className="w-full px-3 py-2 rounded-lg border"
            />
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="部屋コード（顧客番号と同じ、例: 1234）"
              className="w-full px-3 py-2 rounded-lg border font-mono text-sm"
            />
            <p className="text-xs text-indigo-700 font-bold">{STAFF_ROOM_CONVENTION.rules[0].example}</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">生月日（入室パス自動入力）</label>
                <div className="flex gap-2">
                  <input
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="月"
                    className="w-16 px-3 py-2 rounded-lg border text-center"
                    inputMode="numeric"
                  />
                  <input
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="日"
                    className="w-16 px-3 py-2 rounded-lg border text-center"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={applyBirthPassword}
                    className="px-3 py-2 rounded-lg border bg-slate-50 text-sm font-bold whitespace-nowrap"
                  >
                    パスに入れる
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-indigo-700 font-bold">{STAFF_ROOM_CONVENTION.rules[1].example}</p>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="入室パス（生年月日の月日4桁、例：0319）"
              className="w-full px-3 py-2 rounded-lg border font-mono"
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
                      <p className="text-[11px] text-slate-400 mt-1">
                        パス更新: {new Date(r.password_updated_at).toLocaleDateString('ja-JP')}
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
