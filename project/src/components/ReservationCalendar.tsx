import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Stethoscope, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel, { type CustomerRow } from './CustomerSearchPanel';
import ClinicScopeToggle, { type ClinicScope } from './ClinicScopeToggle';
import { CLINIC_FULL, clinicMatchesRecord, resolveClinicNameByCustomerNumber, type ClinicFullName } from '../lib/clinic';
import { getTodayLocalYmd } from '../lib/visitDateParse';

type ReservationRow = Database['public']['Tables']['appointment_reservations']['Row'];
type StaffMaster = Database['public']['Tables']['staff_master']['Row'];
type ReservationStatus = 'scheduled' | 'visited' | 'cancelled';
type EntryKind = 'appointment' | 'vacant' | 'other';
type CalendarViewMode = 'appointment' | 'other';

type ReservationWithCustomer = ReservationRow & {
  customers: Pick<CustomerRow, 'id' | 'name' | 'name_kana' | 'kana' | 'customer_number'> | null;
};

function isAppointmentEntry(r: { entry_kind?: string | null }): boolean {
  const k = r.entry_kind || 'appointment';
  return k === 'appointment';
}

function entryKindLabel(kind: string): string {
  if (kind === 'vacant') return '空き';
  if (kind === 'other') return 'その他';
  return '予約';
}

function chipClass(r: ReservationWithCustomer): string {
  if (!isAppointmentEntry(r)) {
    if (r.entry_kind === 'vacant') return 'bg-amber-100 border-amber-400 text-amber-950';
    return 'bg-violet-100 border-violet-300 text-violet-900';
  }
  if (r.status === 'visited') return 'bg-emerald-100 border-emerald-300 text-emerald-900';
  if (r.status === 'cancelled') return 'bg-slate-100 border-slate-300 text-slate-500 line-through';
  return 'bg-blue-50 border-blue-200 text-blue-900';
}

function chipLabel(r: ReservationWithCustomer): string {
  const t = String(r.start_time).slice(0, 5);
  if (!isAppointmentEntry(r)) {
    const title = String(r.block_title || '').trim() || entryKindLabel(r.entry_kind || 'other');
    return `${t} ${title}`;
  }
  const staff = r.staff_name ? ` / ${r.staff_name}` : '';
  return `${t} ${r.customers?.customer_number || '—'} ${r.customers?.name || ''}${staff}`;
}

export type VisitFromReservationPayload = {
  customer: CustomerRow;
  visitDate: string;
  reservationId: string;
};

interface ReservationCalendarProps {
  onOpenVisitWithReservation: (payload: VisitFromReservationPayload) => void;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function normalizeSearchText(raw: unknown): string {
  const s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
  return s.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function statusLabel(status: string): string {
  if (status === 'visited') return '来院済';
  if (status === 'cancelled') return '取消';
  return '予約';
}

function CalendarViewModeToggle({
  value,
  onChange,
}: {
  value: CalendarViewMode;
  onChange: (v: CalendarViewMode) => void;
}) {
  const btn = (v: CalendarViewMode, label: string, active: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
        value === v ? active : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-gray-600 mr-1">表示:</span>
      {btn('appointment', '予約', 'bg-teal-600 text-white shadow')}
      {btn('other', '予約以外', 'bg-violet-600 text-white shadow')}
    </div>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = String(t || '0:0').split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(aEnd) > timeToMinutes(bStart);
}

function defaultStaffId(list: StaffMaster[]): string {
  const atsu = list.find((s) => s.name === 'あつ');
  return atsu?.id || list[0]?.id || '';
}

export default function ReservationCalendar({ onOpenVisitWithReservation }: ReservationCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('appointment');
  const [clinicScope, setClinicScope] = useState<ClinicScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState<ReservationWithCustomer[]>([]);
  const [staffList, setStaffList] = useState<StaffMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReservationWithCustomer | null>(null);
  const [formDate, setFormDate] = useState(getTodayLocalYmd());
  const [formStart, setFormStart] = useState('10:00');
  const [formEnd, setFormEnd] = useState('11:00');
  const [formClinic, setFormClinic] = useState<ClinicFullName>(CLINIC_FULL.takatsuki);
  const [formMemo, setFormMemo] = useState('');
  const [formStatus, setFormStatus] = useState<ReservationStatus>('scheduled');
  const [formEntryKind, setFormEntryKind] = useState<EntryKind>('appointment');
  const [formBlockTitle, setFormBlockTitle] = useState('');
  const [formStaffId, setFormStaffId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedStaff = useMemo(
    () => staffList.find((s) => s.id === formStaffId) || null,
    [formStaffId, staffList]
  );

  const monthMeta = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const last = new Date(viewYear, viewMonth, 0);
    return {
      startYmd: formatYmd(first),
      endYmd: formatYmd(last),
      daysInMonth: last.getDate(),
      startWeekday: first.getDay(),
    };
  }, [viewYear, viewMonth]);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('appointment_reservations')
      .select('*, customers(id, name, name_kana, kana, customer_number)')
      .gte('reservation_date', monthMeta.startYmd)
      .lte('reservation_date', monthMeta.endYmd)
      .order('reservation_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      setRows((data || []) as ReservationWithCustomer[]);
    }
    setLoading(false);
  }, [monthMeta.endYmd, monthMeta.startYmd]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    const loadStaff = async () => {
      const { data } = await supabase
        .from('staff_master')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      const list = (data || []) as StaffMaster[];
      setStaffList(list);
      setFormStaffId((current) => current || defaultStaffId(list));
    };
    void loadStaff();
  }, []);

  useEffect(() => {
    const onUpdated = () => void loadReservations();
    window.addEventListener('records-updated', onUpdated);
    window.addEventListener('customers-updated', onUpdated);
    window.addEventListener('reservations-updated', onUpdated);
    return () => {
      window.removeEventListener('records-updated', onUpdated);
      window.removeEventListener('customers-updated', onUpdated);
      window.removeEventListener('reservations-updated', onUpdated);
    };
  }, [loadReservations]);

  const filteredRows = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    return rows.filter((r) => {
      const appt = isAppointmentEntry(r);
      if (calendarViewMode === 'appointment' && !appt) return false;
      if (calendarViewMode === 'other' && appt) return false;
      if (!clinicMatchesRecord(clinicScope, r.clinic_name)) return false;
      if (!q) return true;
      if (appt) {
        const c = r.customers;
        const hay = [c?.name, c?.name_kana, c?.kana, c?.customer_number, r.memo]
          .filter(Boolean)
          .map(normalizeSearchText)
          .join(' ');
        return hay.includes(q);
      }
      const hay = [r.block_title, r.memo, entryKindLabel(r.entry_kind || 'other')]
        .filter(Boolean)
        .map(normalizeSearchText)
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, clinicScope, searchQuery, calendarViewMode]);

  const byDate = useMemo(() => {
    const map = new Map<string, ReservationWithCustomer[]>();
    filteredRows.forEach((r) => {
      const key = String(r.reservation_date).slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    });
    map.forEach((list, key) => {
      list.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
      map.set(key, list);
    });
    return map;
  }, [filteredRows]);

  const calendarCells = useMemo(() => {
    const cells: Array<{ kind: 'blank' } | { kind: 'day'; ymd: string; day: number }> = [];
    for (let i = 0; i < monthMeta.startWeekday; i++) cells.push({ kind: 'blank' });
    for (let d = 1; d <= monthMeta.daysInMonth; d++) {
      const ymd = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ kind: 'day', ymd, day: d });
    }
    return cells;
  }, [monthMeta.daysInMonth, monthMeta.startWeekday, viewMonth, viewYear]);

  const openCreate = (ymd: string) => {
    setEditing(null);
    setFormDate(ymd);
    setFormStart('10:00');
    setFormEnd('11:00');
    setFormClinic(CLINIC_FULL.takatsuki);
    setFormMemo('');
    setFormStatus('scheduled');
    setFormStaffId(defaultStaffId(staffList));
    setSelectedCustomer(null);
    if (calendarViewMode === 'other') {
      setFormEntryKind('vacant');
      setFormBlockTitle('空き');
    } else {
      setFormEntryKind('appointment');
      setFormBlockTitle('');
    }
    setEditorOpen(true);
  };

  const openEdit = (r: ReservationWithCustomer) => {
    setEditing(r);
    setFormDate(String(r.reservation_date).slice(0, 10));
    setFormStart(String(r.start_time).slice(0, 5));
    setFormEnd(String(r.end_time).slice(0, 5));
    setFormClinic((r.clinic_name as ClinicFullName) || CLINIC_FULL.takatsuki);
    setFormMemo(String(r.memo || ''));
    setFormStatus((r.status as ReservationStatus) || 'scheduled');
    setFormEntryKind((r.entry_kind as EntryKind) || 'appointment');
    setFormBlockTitle(String(r.block_title || ''));
    setFormStaffId(r.staff_id || staffList.find((s) => s.name === r.staff_name)?.id || defaultStaffId(staffList));
    setSelectedCustomer(r.customers as CustomerRow | null);
    setEditorOpen(true);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const findStaffConflict = async (staff: StaffMaster) => {
    const { data, error } = await supabase
      .from('appointment_reservations')
      .select('*, customers(id, name, name_kana, kana, customer_number)')
      .eq('reservation_date', formDate);

    if (error) {
      alert(`スタッフ重複確認に失敗しました: ${error.message}\nSupabase の予約スタッフ用 SQL を実行してください。`);
      return { blocked: true as const, conflict: null };
    }

    const staffNameKey = normalizeSearchText(staff.name);
    const conflict = ((data || []) as ReservationWithCustomer[]).find((r) => {
      if (editing && r.id === editing.id) return false;
      if (!isAppointmentEntry(r)) return false;
      if (r.status === 'cancelled') return false;
      const sameStaff = r.staff_id === staff.id || normalizeSearchText(r.staff_name) === staffNameKey;
      return sameStaff && rangesOverlap(formStart, formEnd, String(r.start_time), String(r.end_time));
    });

    return { blocked: Boolean(conflict), conflict };
  };

  const saveReservation = async () => {
    const isAppt = formEntryKind === 'appointment';
    if (isAppt && !selectedCustomer) {
      alert('顧客を選んでください');
      return;
    }
    if (isAppt && !selectedStaff) {
      alert('スタッフを選んでください');
      return;
    }
    if (!isAppt && !formBlockTitle.trim() && !formMemo.trim()) {
      alert('表示名またはメモを入力してください');
      return;
    }
    if (!formDate || !formStart || !formEnd) {
      alert('日付と時間を入力してください');
      return;
    }
    if (timeToMinutes(formEnd) <= timeToMinutes(formStart)) {
      alert('終了時間は開始時間より後にしてください');
      return;
    }

    if (isAppt && selectedStaff) {
      const { blocked, conflict } = await findStaffConflict(selectedStaff);
      if (blocked) {
        if (conflict) {
          alert(
            `同じスタッフ（${selectedStaff.name}）の時間が重なっています。\n` +
              `${String(conflict.start_time).slice(0, 5)}〜${String(conflict.end_time).slice(0, 5)} ` +
              `${conflict.customers?.customer_number || ''} ${conflict.customers?.name || ''}`
          );
        }
        return;
      }
    }

    setSaving(true);
    const autoClinic = selectedCustomer
      ? resolveClinicNameByCustomerNumber(selectedCustomer.customer_number)
      : null;
    const payload = {
      customer_id: isAppt ? selectedCustomer!.id : null,
      reservation_date: formDate,
      start_time: formStart,
      end_time: formEnd,
      clinic_name: autoClinic || formClinic,
      memo: formMemo.trim() || null,
      status: isAppt ? formStatus : 'scheduled',
      entry_kind: formEntryKind,
      block_title: isAppt ? null : formBlockTitle.trim() || null,
      staff_id: isAppt ? selectedStaff?.id || null : null,
      staff_name: isAppt ? selectedStaff?.name || null : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = editing
      ? await supabase.from('appointment_reservations').update(payload).eq('id', editing.id)
      : await supabase.from('appointment_reservations').insert([payload]);

    setSaving(false);
    if (error) {
      alert(`予約の保存に失敗しました: ${error.message}`);
      return;
    }
    setEditorOpen(false);
    window.dispatchEvent(new Event('reservations-updated'));
    void loadReservations();
  };

  const deleteReservation = async () => {
    if (!editing) return;
    if (!window.confirm('この予約を削除しますか？')) return;
    setSaving(true);
    const { error } = await supabase.from('appointment_reservations').delete().eq('id', editing.id);
    setSaving(false);
    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    setEditorOpen(false);
    window.dispatchEvent(new Event('reservations-updated'));
    void loadReservations();
  };

  const openVisit = (r: ReservationWithCustomer) => {
    if (!isAppointmentEntry(r)) return;
    const c = r.customers;
    if (!c) {
      alert('顧客情報が見つかりません');
      return;
    }
    onOpenVisitWithReservation({
      customer: c as CustomerRow,
      visitDate: String(r.reservation_date).slice(0, 10),
      reservationId: r.id,
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <CalendarDays className="text-teal-600" size={22} />
            予約確認表（月間）
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border bg-white hover:bg-slate-50" aria-label="前月">
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 font-bold text-gray-800 min-w-[8rem] text-center">
              {viewYear}年{viewMonth}月
            </span>
            <button type="button" onClick={() => shiftMonth(1)} className="p-2 rounded-lg border bg-white hover:bg-slate-50" aria-label="翌月">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <CalendarViewModeToggle value={calendarViewMode} onChange={setCalendarViewMode} />
          <ClinicScopeToggle value={clinicScope} onChange={setClinicScope} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={calendarViewMode === 'appointment' ? '氏名・かな・番号で絞り込み' : '表示名・メモで絞り込み'}
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm"
            lang="ja"
          />
          <button
            type="button"
            onClick={() => openCreate(getTodayLocalYmd())}
            className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm font-bold ${
              calendarViewMode === 'appointment' ? 'bg-teal-600' : 'bg-violet-600'
            }`}
          >
            <Plus size={16} />
            {calendarViewMode === 'appointment' ? '予約追加' : '枠を追加'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          {calendarViewMode === 'appointment' ? (
            <>
              患者さんの<strong>予約</strong>のみ表示します。
              <strong className="text-amber-800">来院入力の記録は自動では載りません</strong>
              （予約として登録した分だけ表示）。
            </>
          ) : (
            <>
              <span className="text-amber-800 font-bold">空き</span>・
              <span className="text-violet-800 font-bold">その他</span>
              の枠（顧客なし）。日付タップで登録。
            </>
          )}
        </p>
      </div>

      {loadError && (
        <div className="mx-4 mt-3 p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
          予約の読み込みに失敗しました: {loadError}
          <div className="text-xs mt-1">Supabase に migration（appointment_reservations）を適用してください。</div>
        </div>
      )}

      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-xs font-bold py-1 ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-gray-600'}`}
            >
              {w}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-500 py-8">読み込み中...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1 panel-scrollbar max-h-[28rem] overflow-y-auto">
            {calendarCells.map((cell, idx) => {
              if (cell.kind === 'blank') {
                return <div key={`blank-${idx}`} className="min-h-[5.5rem] bg-slate-50/50 rounded-lg" />;
              }
              const list = byDate.get(cell.ymd) || [];
              const isToday = cell.ymd === getTodayLocalYmd();
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  onClick={() => openCreate(cell.ymd)}
                  className={`min-h-[5.5rem] rounded-lg border p-1 text-left hover:ring-2 hover:ring-teal-300 transition-shadow ${
                    isToday ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className={`text-xs font-bold mb-1 ${isToday ? 'text-teal-800' : 'text-gray-700'}`}>{cell.day}</div>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            openEdit(r);
                          }
                        }}
                        className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${chipClass(r)}`}
                        title={`${r.start_time}-${r.end_time} ${chipLabel(r)}`}
                      >
                        {chipLabel(r)}
                      </div>
                    ))}
                    {list.length > 3 && (
                      <div className="text-[10px] text-gray-500 px-1">他{list.length - 3}件</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {editing
                  ? isAppointmentEntry(editing)
                    ? '予約を修正'
                    : '枠を修正'
                  : formEntryKind === 'appointment'
                    ? '予約を追加'
                    : '枠を追加（予約以外）'}
              </h3>
              <button type="button" onClick={() => setEditorOpen(false)} className="text-gray-500 font-bold px-2">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {formEntryKind === 'appointment' ? (
                <>
                  <CustomerSearchPanel
                    accent="blue"
                    selectedCustomer={selectedCustomer}
                    onSelect={setSelectedCustomer}
                    onClearSelection={() => setSelectedCustomer(null)}
                  />
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">スタッフ</label>
                    {staffList.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {staffList.map((staff) => (
                          <button
                            key={staff.id}
                            type="button"
                            onClick={() => setFormStaffId(staff.id)}
                            className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                              formStaffId === staff.id
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow'
                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {staff.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        スタッフマスターが未登録、または読み込み中です。
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">種類</label>
                    <select
                      value={formEntryKind}
                      onChange={(e) => {
                        const k = e.target.value as EntryKind;
                        setFormEntryKind(k);
                        if (k === 'vacant' && !formBlockTitle.trim()) setFormBlockTitle('空き');
                      }}
                      className="w-full border rounded-lg px-2 py-2"
                    >
                      <option value="vacant">空き（Vacant）</option>
                      <option value="other">その他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">表示名（カレンダーに出る文字）</label>
                    <input
                      type="text"
                      value={formBlockTitle}
                      onChange={(e) => setFormBlockTitle(e.target.value)}
                      placeholder="例: 空き / 昼休み / 会議"
                      className="w-full border rounded-lg px-2 py-2"
                      lang="ja"
                    />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">予約日</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full border rounded-lg px-2 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">院</label>
                  <select
                    value={formClinic}
                    onChange={(e) => setFormClinic(e.target.value as ClinicFullName)}
                    className="w-full border rounded-lg px-2 py-2"
                  >
                    <option value={CLINIC_FULL.takatsuki}>高槻院</option>
                    <option value={CLINIC_FULL.kawanishi}>川西院</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">開始</label>
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} className="w-full border rounded-lg px-2 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">終了</label>
                  <input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className="w-full border rounded-lg px-2 py-2" />
                </div>
              </div>
              {editing && isAppointmentEntry(editing) && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">状態</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ReservationStatus)}
                    className="w-full border rounded-lg px-2 py-2"
                  >
                    <option value="scheduled">予約</option>
                    <option value="visited">来院済</option>
                    <option value="cancelled">取消</option>
                  </select>
                </div>
              )}
              {editing && !isAppointmentEntry(editing) && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">種類</label>
                  <select
                    value={formEntryKind}
                    onChange={(e) => setFormEntryKind(e.target.value as EntryKind)}
                    className="w-full border rounded-lg px-2 py-2"
                  >
                    <option value="vacant">空き（Vacant）</option>
                    <option value="other">その他</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">メモ</label>
                <textarea value={formMemo} onChange={(e) => setFormMemo(e.target.value)} rows={2} className="w-full border rounded-lg px-2 py-2" lang="ja" />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveReservation()}
                  className="flex-1 min-w-[120px] py-2 rounded-lg bg-teal-600 text-white font-bold disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
                {editing && isAppointmentEntry(editing) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openVisit(editing)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white font-bold"
                    >
                      <Stethoscope size={16} />
                      来院入力へ
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteReservation()}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-300 text-red-700 font-bold"
                    >
                      <Trash2 size={16} />
                      削除
                    </button>
                  </>
                )}
              </div>
              {editing && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Pencil size={12} />
                  {statusLabel(editing.status)} / {editing.start_time.slice(0, 5)}〜{editing.end_time.slice(0, 5)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
