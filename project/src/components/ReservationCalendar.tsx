import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Stethoscope, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel, { type CustomerRow } from './CustomerSearchPanel';
import ClinicScopeToggle, { type ClinicScope } from './ClinicScopeToggle';
import FlexibleTimeInput from './FlexibleTimeInput';
import { ensureJapaneseImeForInput } from '../lib/useJapaneseTextInputs';
import { guardNavigation, useFormInputTouched, useUnsavedFormGuard } from '../lib/unsavedFormGuard';
import SecretInputField, { OTHER_CAL_PASSWORD_HINT } from './SecretInputField';
import ModalCloseButton from './ModalCloseButton';
import { CLINIC_FULL, clinicMatchesRecord, resolveClinicNameByCustomerNumber, type ClinicFullName } from '../lib/clinic';
import { isPlaceholderCustomerNumber } from '../lib/customerNumber';
import { getTodayLocalYmd } from '../lib/visitDateParse';
import { fetchAllCustomersByCreatedDesc } from '../lib/fetchAllCustomers';
import { syncReservationsVisitedByExistingVisits } from '../lib/appointmentReservations';
import {
  blockedChipClass,
  blockedChipLabel,
  buildAppointmentDayTimeline,
  gapChipClass,
  gapChipLabel,
  type DayTimelineItem,
} from '../lib/reservationGaps';
import { fetchWeekdayBusinessHours, type WeekdayBusinessHour } from '../lib/weekdayBusinessHours';
import { findStaffAppointmentOverlap, formatStaffOverlapAlert } from '../lib/reservationOverlap';
import {
  fetchOtherCalendarPassword,
  isOtherCalendarUnlocked,
  setOtherCalendarUnlocked,
  verifyOtherCalendarPassword,
} from '../lib/otherCalendarAuth';

type ReservationRow = Database['public']['Tables']['appointment_reservations']['Row'];
type StaffMaster = Database['public']['Tables']['staff_master']['Row'];
type VisitRecordRow = Database['public']['Tables']['visit_records']['Row'];
type CalendarColorRule = Database['public']['Tables']['calendar_color_master']['Row'];
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

function colorClassByKey(colorKey: string): string {
  if (colorKey === 'red') return 'bg-red-100 border-red-300 text-red-900';
  if (colorKey === 'purple') return 'bg-purple-100 border-purple-300 text-purple-900';
  if (colorKey === 'amber') return 'bg-amber-100 border-amber-300 text-amber-950';
  if (colorKey === 'green') return 'bg-green-100 border-green-300 text-green-900';
  if (colorKey === 'slate') return 'bg-slate-100 border-slate-300 text-slate-700';
  if (colorKey === 'teal') return 'bg-teal-100 border-teal-300 text-teal-900';
  return 'bg-blue-50 border-blue-200 text-blue-900';
}

function defaultAppointmentColorKey(r: ReservationWithCustomer): string {
  const clinic = String(r.clinic_name || '');
  if (clinic.includes('川西')) return 'green';
  return 'blue';
}

function appointmentColorKey(r: ReservationWithCustomer, colorRules: CalendarColorRule[]): string {
  const hay = normalizeSearchText(r.memo);
  const hit = colorRules.find((rule) => {
    const q = normalizeSearchText(rule.match_text || rule.name);
    return q.length > 0 && hay.includes(q);
  });
  return hit?.color_key || defaultAppointmentColorKey(r);
}

function personalScheduleTitle(r: ReservationWithCustomer): string {
  return String(r.block_title || '').trim() || '（無題）';
}

function chipClass(r: ReservationWithCustomer, colorRules: CalendarColorRule[]): string {
  if (!isAppointmentEntry(r)) {
    return 'bg-violet-100 border-violet-300 text-violet-900';
  }
  if (r.status === 'cancelled') return 'bg-slate-100 border-slate-300 text-slate-500 line-through';
  return colorClassByKey(appointmentColorKey(r, colorRules));
}

function appointmentStatusSuffix(r: ReservationWithCustomer): string {
  if (r.status === 'visited') return '済';
  if (r.status === 'cancelled') return '消';
  return '未';
}

/** 月間マス用（スマホ）：時刻・番号・別バッジをやめて名前を最大表示 */
function chipLabelCompact(r: ReservationWithCustomer): string {
  if (!isAppointmentEntry(r)) {
    return personalScheduleTitle(r);
  }
  const mark = appointmentStatusSuffix(r);
  const staff = r.staff_name ? `·${String(r.staff_name).charAt(0)}` : '';
  if (isPlaceholderCustomerNumber(r.customers?.customer_number)) {
    const memo = String(r.memo || '').trim();
    const hint = memo ? memo.slice(0, 4) : '';
    return `新規${hint}${staff}${mark}`;
  }
  const name = r.customers?.name || '？';
  return `${name}${staff}${mark}`;
}

function chipLabel(r: ReservationWithCustomer): string {
  const t = String(r.start_time).slice(0, 5);
  if (!isAppointmentEntry(r)) {
    return personalScheduleTitle(r);
  }
  const staff = r.staff_name ? ` / ${r.staff_name}` : '';
  if (isPlaceholderCustomerNumber(r.customers?.customer_number)) {
    const memo = String(r.memo || '').trim();
    const memoHint = memo ? ` ${memo}` : '';
    return `${t} 新規仮${memoHint}${staff}`;
  }
  const number = r.customers?.customer_number ? ` #${r.customers.customer_number}` : '';
  return `${t} ${r.customers?.name || '名前未設定'}${number}${staff}`;
}

export type VisitFromReservationPayload = {
  customer: CustomerRow;
  visitDate: string;
  reservationId: string;
};

interface ReservationCalendarProps {
  onOpenVisitWithReservation: (payload: VisitFromReservationPayload) => void;
  onOpenCustomerChart: (customer: CustomerRow) => void;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;
/** 日曜列は半分幅、月〜土に配分（休診日が多いため） */
const CALENDAR_MONTH_GRID =
  'grid gap-px sm:gap-1 [grid-template-columns:minmax(0,0.5fr)_repeat(6,minmax(0,1fr))]';
const DAY_CELL_VISIBLE_LIMIT = 10;

function renderTimelineItem(
  item: DayTimelineItem,
  colorRules: CalendarColorRule[],
  onEditReservation: (r: ReservationWithCustomer) => void,
  compact: boolean
) {
  if (item.kind === 'blocked') {
    const label = blockedChipLabel(item.blocked);
    const compactLabel = `不可${item.blocked.minutes}`;
    return (
      <div
        key={item.blocked.id}
        className={`flex items-center min-w-0 leading-none border ${blockedChipClass()} ${
          compact
            ? 'max-sm:gap-0 max-sm:px-[2px] max-sm:py-0 max-sm:rounded-[2px] max-sm:border-l-2 max-sm:border-t-0 max-sm:border-r-0 max-sm:border-b-0 max-sm:text-[9px] sm:gap-1 sm:leading-tight sm:px-1 sm:py-0.5 sm:rounded sm:text-[10px]'
            : 'gap-1 leading-tight px-1 py-0.5 rounded text-xs'
        }`}
        title={`不可時間（休憩） ${item.blocked.minutes}分 ${item.blocked.startTime}〜${item.blocked.endTime}`}
      >
        <span className="shrink-0 font-black hidden sm:inline">不可</span>
        <span className="min-w-0 truncate sm:hidden">{compactLabel}</span>
        <span className="min-w-0 truncate hidden sm:inline">{label}</span>
      </div>
    );
  }
  if (item.kind === 'gap') {
    const label = gapChipLabel(item.gap);
    const gapCompactLabel = `空${item.gap.minutes}`;
    return (
      <div
        key={item.gap.id}
        className={`flex items-center min-w-0 leading-none border ${gapChipClass()} ${
          compact
            ? 'max-sm:gap-0 max-sm:px-[2px] max-sm:py-0 max-sm:rounded-[2px] max-sm:border-l-2 max-sm:border-t-0 max-sm:border-r-0 max-sm:border-b-0 max-sm:text-[9px] sm:gap-1 sm:leading-tight sm:px-1 sm:py-0.5 sm:rounded sm:text-[10px]'
            : 'gap-1 leading-tight px-1 py-0.5 rounded text-xs'
        }`}
        title={`空白 ${item.gap.minutes}分 ${item.gap.startTime}〜${item.gap.endTime}`}
      >
        <span className="shrink-0 font-black text-slate-600 hidden sm:inline">空</span>
        <span className="min-w-0 truncate sm:hidden">{gapCompactLabel}</span>
        <span className="min-w-0 truncate hidden sm:inline">{label}</span>
      </div>
    );
  }
  const r = item.reservation as ReservationWithCustomer;
  return (
    <div
      key={r.id}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onEditReservation(r);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          onEditReservation(r);
        }
      }}
      className={`flex items-center min-w-0 cursor-pointer border ${chipClass(r, colorRules)} ${
        compact
          ? 'max-sm:gap-0 max-sm:px-[2px] max-sm:py-0 max-sm:rounded-[2px] max-sm:border-l-2 max-sm:border-t-0 max-sm:border-r-0 max-sm:border-b-0 max-sm:leading-none max-sm:text-[9px] sm:gap-1 sm:leading-tight sm:px-1 sm:py-0.5 sm:rounded sm:text-[10px]'
          : 'gap-1 leading-tight px-1 py-0.5 rounded text-sm'
      }`}
      title={
        isAppointmentEntry(r)
          ? `${r.start_time}-${r.end_time} ${statusLabel(r.status)} ${chipLabel(r)}`
          : `${String(r.start_time).slice(0, 5)}〜${String(r.end_time).slice(0, 5)} ${personalScheduleTitle(r)}${
              r.memo ? `\n${r.memo}` : ''
            }`
      }
    >
      {isAppointmentEntry(r) && (
        <span className={compact ? 'hidden sm:inline shrink-0' : 'shrink-0'}>{processStatusBadge(r)}</span>
      )}
      {compact ? (
        <span className="min-w-0 flex-1 truncate sm:hidden">{chipLabelCompact(r)}</span>
      ) : null}
      <span className={`min-w-0 flex-1 truncate ${compact ? 'hidden sm:inline' : ''}`}>{chipLabel(r)}</span>
    </div>
  );
}

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
  if (status === 'visited') return '済';
  if (status === 'cancelled') return '取消';
  return '未処理';
}

function processStatusBadge(r: ReservationWithCustomer): JSX.Element | null {
  if (!isAppointmentEntry(r)) return null;
  if (r.status === 'visited') {
    return <span className="shrink-0 font-black text-blue-700">済</span>;
  }
  if (r.status === 'cancelled') {
    return <span className="shrink-0 font-black text-slate-500">取消</span>;
  }
  return <span className="shrink-0 font-black text-red-700">未処理</span>;
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

function defaultStaffId(list: StaffMaster[]): string {
  const atsu = list.find((s) => s.name === 'あつ');
  return atsu?.id || list[0]?.id || '';
}

function formatAmount(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0円';
  return `${n.toLocaleString('ja-JP')}円`;
}

export default function ReservationCalendar({ onOpenVisitWithReservation, onOpenCustomerChart }: ReservationCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('appointment');
  const [otherCalendarUnlocked, setOtherCalendarUnlockedState] = useState(isOtherCalendarUnlocked);
  const [otherPasswordModalOpen, setOtherPasswordModalOpen] = useState(false);
  const [otherPasswordInput, setOtherPasswordInput] = useState('');
  const [otherPasswordExpected, setOtherPasswordExpected] = useState('');
  const [otherPasswordError, setOtherPasswordError] = useState('');
  const [otherPasswordConfigured, setOtherPasswordConfigured] = useState(false);
  const [clinicScope, setClinicScope] = useState<ClinicScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState<ReservationWithCustomer[]>([]);
  const [staffList, setStaffList] = useState<StaffMaster[]>([]);
  const [colorRules, setColorRules] = useState<CalendarColorRule[]>([]);
  const [weekdayHours, setWeekdayHours] = useState<WeekdayBusinessHour[]>([]);
  const [allCustomers, setAllCustomers] = useState<CustomerRow[]>([]);
  const [showHeaderCustomerResults, setShowHeaderCustomerResults] = useState(false);
  const [headerCustomerHighlight, setHeaderCustomerHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const {
    isTouched: reservationInputTouched,
    clearTouched: clearReservationInputTouched,
    formInputProps: reservationFormInputProps,
  } = useFormInputTouched(editorOpen);
  useUnsavedFormGuard('reservation-editor', editorOpen && reservationInputTouched);

  const closeReservationEditor = () => {
    guardNavigation(() => {
      setEditorOpen(false);
      clearReservationInputTouched();
    });
  };

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
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);
  const [visitHistoryCustomer, setVisitHistoryCustomer] = useState<CustomerRow | null>(null);
  const [visitHistoryRows, setVisitHistoryRows] = useState<VisitRecordRow[]>([]);
  const [visitHistoryLoading, setVisitHistoryLoading] = useState(false);
  const [visitHistoryError, setVisitHistoryError] = useState('');
  const headerResultsRef = useRef<HTMLDivElement>(null);

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
    const fetchRows = () => supabase
      .from('appointment_reservations')
      .select('*, customers(id, name, name_kana, kana, customer_number)')
      .gte('reservation_date', monthMeta.startYmd)
      .lte('reservation_date', monthMeta.endYmd)
      .order('reservation_date', { ascending: true })
      .order('start_time', { ascending: true });

    const { data, error } = await fetchRows();

    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      try {
        const synced = await syncReservationsVisitedByExistingVisits(monthMeta.startYmd, monthMeta.endYmd);
        if (synced > 0) {
          const refreshed = await fetchRows();
          if (refreshed.error) throw refreshed.error;
          setRows((refreshed.data || []) as ReservationWithCustomer[]);
        } else {
          setRows((data || []) as ReservationWithCustomer[]);
        }
      } catch (syncError) {
        console.error('予約の来院済み同期エラー:', syncError);
        setRows((data || []) as ReservationWithCustomer[]);
      }
    }
    setLoading(false);
  }, [monthMeta.endYmd, monthMeta.startYmd]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    void fetchOtherCalendarPassword().then((p) => {
      setOtherPasswordExpected(p);
      setOtherPasswordConfigured(p.length > 0);
    });
  }, []);

  const requestViewMode = (mode: CalendarViewMode) => {
    if (mode === 'appointment') {
      setCalendarViewMode('appointment');
      return;
    }
    if (otherCalendarUnlocked) {
      setCalendarViewMode('other');
      return;
    }
    if (!otherPasswordConfigured) {
      alert(
        '「予約以外」用の入室パスワードが未設定です。\n設定 → 経営ルール設定 の「予約以外」欄で「パスワードを保存」してください。'
      );
      return;
    }
    setOtherPasswordInput('');
    setOtherPasswordError('');
    setOtherPasswordModalOpen(true);
  };

  const submitOtherPassword = () => {
    if (!verifyOtherCalendarPassword(otherPasswordInput, otherPasswordExpected)) {
      setOtherPasswordError('パスワードが違います');
      return;
    }
    setOtherCalendarUnlocked();
    setOtherCalendarUnlockedState(true);
    setOtherPasswordModalOpen(false);
    setCalendarViewMode('other');
  };

  const loadColorRules = useCallback(async () => {
    const { data, error } = await supabase
      .from('calendar_color_master')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (!error) setColorRules((data || []) as CalendarColorRule[]);
  }, []);

  useEffect(() => {
    void loadColorRules();
    const onUpdated = () => void loadColorRules();
    window.addEventListener('masters-updated', onUpdated);
    return () => window.removeEventListener('masters-updated', onUpdated);
  }, [loadColorRules]);

  const loadWeekdayHours = useCallback(async () => {
    setWeekdayHours(await fetchWeekdayBusinessHours());
  }, []);

  useEffect(() => {
    void loadWeekdayHours();
    const onUpdated = () => void loadWeekdayHours();
    window.addEventListener('masters-updated', onUpdated);
    return () => window.removeEventListener('masters-updated', onUpdated);
  }, [loadWeekdayHours]);

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
    const loadCustomers = async () => {
      try {
        setAllCustomers(await fetchAllCustomersByCreatedDesc());
      } catch (error) {
        console.error('顧客一覧の取得エラー:', error);
      }
    };
    void loadCustomers();
    const onCustomersUpdated = () => void loadCustomers();
    window.addEventListener('customers-updated', onCustomersUpdated);
    return () => window.removeEventListener('customers-updated', onCustomersUpdated);
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
      const hay = [r.block_title, r.memo]
        .filter(Boolean)
        .map(normalizeSearchText)
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, clinicScope, searchQuery, calendarViewMode]);

  const headerCustomerResults = useMemo(() => {
    if (calendarViewMode !== 'appointment') return [];
    const q = normalizeSearchText(searchQuery);
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    const scored: Array<{ row: CustomerRow; tier: number }> = [];

    for (const c of allCustomers) {
      const number = normalizeSearchText(c.customer_number);
      const name = normalizeSearchText(c.name);
      const kana = normalizeSearchText(c.name_kana || c.kana);
      let tier: number | null = null;
      if (digits && number.replace(/\D/g, '') === digits) tier = 0;
      else if (digits && number.replace(/\D/g, '').startsWith(digits)) tier = 1;
      else if (name.includes(q) || kana.includes(q)) tier = 2;
      else if (number.includes(q)) tier = 3;
      if (tier !== null) scored.push({ row: c, tier });
    }

    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return String(a.row.customer_number || '').localeCompare(String(b.row.customer_number || ''), undefined, { numeric: true });
    });
    return scored.slice(0, 10).map((s) => s.row);
  }, [allCustomers, calendarViewMode, searchQuery]);

  useEffect(() => {
    setHeaderCustomerHighlight(0);
  }, [searchQuery, headerCustomerResults.length]);

  useEffect(() => {
    const el = headerResultsRef.current?.querySelector(`[data-header-customer-idx="${headerCustomerHighlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [headerCustomerHighlight]);

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

  const dayDetailRows = useMemo(() => {
    if (!dayDetailDate) return [];
    return byDate.get(dayDetailDate) || [];
  }, [byDate, dayDetailDate]);

  const dayDetailTimeline = useMemo(() => {
    if (!dayDetailDate) return [] as DayTimelineItem[];
    const list = dayDetailRows;
    if (calendarViewMode !== 'appointment') {
      return list
        .map((r) => ({
          kind: 'reservation' as const,
          sortMin: timeToMinutes(r.start_time),
          reservation: r,
        }))
        .sort((a, b) => a.sortMin - b.sortMin);
    }
    return buildAppointmentDayTimeline(list, { dateYmd: dayDetailDate, weekdayHours });
  }, [dayDetailDate, dayDetailRows, calendarViewMode, weekdayHours]);

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
    clearReservationInputTouched();
    setDayDetailDate(null);
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
      setFormEntryKind('other');
      setFormBlockTitle('');
    } else {
      setFormEntryKind('appointment');
      setFormBlockTitle('');
    }
    setEditorOpen(true);
  };

  const openEdit = (r: ReservationWithCustomer) => {
    clearReservationInputTouched();
    setDayDetailDate(null);
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

  const openVisitHistory = async (customer: CustomerRow) => {
    setVisitHistoryCustomer(customer);
    setVisitHistoryRows([]);
    setVisitHistoryError('');
    setVisitHistoryLoading(true);
    const { data, error } = await supabase
      .from('visit_records')
      .select('*')
      .eq('customer_id', customer.id)
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false });

    setVisitHistoryLoading(false);
    if (error) {
      setVisitHistoryError(error.message);
      return;
    }
    setVisitHistoryRows((data || []) as VisitRecordRow[]);
  };

  const handleSelectCustomer = (customer: CustomerRow) => {
    setSelectedCustomer(customer);
  };

  const handleSelectHeaderCustomer = (customer: CustomerRow) => {
    setSearchQuery(customer.customer_number || customer.name || '');
    setShowHeaderCustomerResults(false);
    void openVisitHistory(customer);
  };

  const handleHeaderSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showHeaderCustomerResults || headerCustomerResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHeaderCustomerHighlight((i) => Math.min(i + 1, headerCustomerResults.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHeaderCustomerHighlight((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const customer = headerCustomerResults[headerCustomerHighlight];
      if (customer) handleSelectHeaderCustomer(customer);
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  const findStaffConflict = async (staff: StaffMaster) => {
    const dateYmd = String(formDate).slice(0, 10);
    const overlapOpts = {
      staffId: staff.id,
      staffName: staff.name,
      dateYmd,
      start: formStart,
      end: formEnd,
      excludeId: editing?.id ?? null,
    };

    const localHit = findStaffAppointmentOverlap(rows, overlapOpts);
    if (localHit) return { blocked: true as const, conflict: localHit };

    const { data, error } = await supabase
      .from('appointment_reservations')
      .select('*, customers(id, name, name_kana, kana, customer_number)')
      .eq('reservation_date', dateYmd);

    if (error) {
      alert(`予約の重複確認に失敗しました: ${error.message}\nSupabase の予約用 SQL を実行してください。`);
      return { blocked: true as const, conflict: null };
    }

    const remoteHit = findStaffAppointmentOverlap((data || []) as ReservationWithCustomer[], overlapOpts);
    return { blocked: Boolean(remoteHit), conflict: remoteHit };
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
    if (!isAppt && !formBlockTitle.trim()) {
      alert('表示名を入力してください');
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
            formatStaffOverlapAlert(
              selectedStaff.name,
              conflict,
              String(formStart).slice(0, 5),
              String(formEnd).slice(0, 5)
            )
          );
        } else {
          alert('予約の重複確認に失敗したため、登録を中止しました。');
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
      entry_kind: isAppt ? 'appointment' : 'other',
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
    clearReservationInputTouched();
    setEditorOpen(false);
    window.dispatchEvent(new Event('reservations-updated'));
    void loadReservations();
  };

  const deleteReservation = async () => {
    if (!editing) return;
    const label = isAppointmentEntry(editing) ? 'この予約' : 'この枠（予約以外）';
    if (!window.confirm(`${label}を削除しますか？`)) return;
    setSaving(true);
    const { error } = await supabase.from('appointment_reservations').delete().eq('id', editing.id);
    setSaving(false);
    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    clearReservationInputTouched();
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
    if (isPlaceholderCustomerNumber(c.customer_number)) {
      alert(
        '仮予約（10000・新規仮）のまま来院入力はできません。\n' +
          '10000の予約を削除し、正式患者の予約を同じ時間で作成してから、そちらから来院入力してください。'
      );
      return;
    }
    onOpenVisitWithReservation({
      customer: c as CustomerRow,
      visitDate: String(r.reservation_date).slice(0, 10),
      reservationId: r.id,
    });
  };

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 overflow-hidden max-sm:shadow">
      <div className="px-2 py-2 sm:px-4 sm:py-3 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-1 sm:gap-2">
            <CalendarDays className="text-teal-600 shrink-0" size={20} />
            <span className="truncate">予約確認表（月間）</span>
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
          <CalendarViewModeToggle value={calendarViewMode} onChange={requestViewMode} />
          <ClinicScopeToggle value={clinicScope} onChange={setClinicScope} />
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              data-ime="ja"
              value={searchQuery}
              onFocus={(e) => {
                ensureJapaneseImeForInput(e.currentTarget);
                setShowHeaderCustomerResults(true);
              }}
              onBlur={() => window.setTimeout(() => setShowHeaderCustomerResults(false), 120)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowHeaderCustomerResults(true);
              }}
              onKeyDown={handleHeaderSearchKeyDown}
              placeholder={calendarViewMode === 'appointment' ? 'ふりがな・氏名・番号で絞り込み' : '表示名・メモで絞り込み'}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              lang="ja"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {calendarViewMode === 'appointment' && showHeaderCustomerResults && searchQuery.trim() && headerCustomerResults.length > 0 && (
              <div ref={headerResultsRef} className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-80 overflow-y-auto rounded-xl border border-blue-200 bg-white shadow-xl">
                {headerCustomerResults.map((customer, idx) => (
                  <button
                    key={customer.id}
                    type="button"
                    data-header-customer-idx={idx}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHeaderCustomerHighlight(idx)}
                    onClick={() => handleSelectHeaderCustomer(customer)}
                    className={`w-full border-b border-gray-100 px-3 py-2 text-left last:border-0 hover:bg-blue-50 ${
                      idx === headerCustomerHighlight ? 'bg-blue-50 ring-1 ring-blue-300' : ''
                    }`}
                  >
                    <div className="font-bold text-gray-800">{customer.name}</div>
                    <div className="text-xs text-gray-600">{customer.name_kana || customer.kana || 'かな未登録'}</div>
                    <div className="text-[11px] text-gray-500">顧客番号: {customer.customer_number || '-'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => openCreate(getTodayLocalYmd())}
            className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm font-bold ${
              calendarViewMode === 'appointment' ? 'bg-teal-600' : 'bg-violet-600'
            }`}
          >
            <Plus size={16} />
            {calendarViewMode === 'appointment' ? '予約追加' : '予定を追加'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-600 hidden sm:block">
          {calendarViewMode === 'appointment' ? (
            <>
              患者さんの<strong>予約</strong>のみ表示します。
              <strong className="text-amber-800">来院入力の記録は自動では載りません</strong>
              （予約として登録した分だけ表示）。
              <span className="ml-2">
                <span className="px-1 rounded border bg-slate-200 border-slate-400 text-slate-700 font-bold">Vac.</span>
                ＝担当「あつ」の空白（5分以上）、
                <span className="px-1 rounded border bg-zinc-800 border-zinc-950 text-zinc-100 font-bold">不可</span>
                ＝休憩（予約不可）。他担当の Vac. は出しません。
              </span>
            </>
          ) : (
            <>
              院長の個人予定（顧客なし）。カレンダーには<strong>表示名のみ</strong>、詳細はメモに記入。日付タップで登録。
              {otherCalendarUnlocked ? (
                <span className="text-violet-700 font-bold">（入室済み）</span>
              ) : null}
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

      <div className="p-0.5 sm:p-3 max-sm:-mx-0.5">
        <div className={`${CALENDAR_MONTH_GRID} mb-px sm:mb-1`}>
          {WEEKDAY_LABELS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-[10px] sm:text-xs font-bold py-0.5 sm:py-1 leading-none ${
                i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-500 py-8">読み込み中...</div>
        ) : (
          <div
            className={`${CALENDAR_MONTH_GRID} panel-scrollbar max-sm:max-h-[calc(100dvh-14rem)] sm:max-h-[36rem] overflow-y-auto`}
          >
            {calendarCells.map((cell, idx) => {
              if (cell.kind === 'blank') {
                return (
                  <div key={`blank-${idx}`} className="min-h-[3.5rem] sm:min-h-[8rem] bg-slate-50/50 rounded-sm sm:rounded-lg" />
                );
              }
              const list = byDate.get(cell.ymd) || [];
              const timeline =
                calendarViewMode === 'appointment'
                  ? buildAppointmentDayTimeline(list, { dateYmd: cell.ymd, weekdayHours })
                  : list.map((r) => ({
                      kind: 'reservation' as const,
                      sortMin: timeToMinutes(r.start_time),
                      reservation: r,
                    }));
              const isToday = cell.ymd === getTodayLocalYmd();
              return (
                <div
                  key={cell.ymd}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDayDetailDate(cell.ymd)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setDayDetailDate(cell.ymd);
                  }}
                  className={`min-h-[3.5rem] sm:min-h-[8rem] rounded-sm sm:rounded-lg border p-px sm:p-1 text-left hover:ring-1 sm:hover:ring-2 hover:ring-teal-300 transition-shadow cursor-pointer ${
                    isToday ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div
                    className={`text-[10px] sm:text-xs font-bold leading-none mb-px sm:mb-1 px-px ${
                      isToday ? 'text-teal-800' : 'text-gray-700'
                    }`}
                  >
                    {cell.day}
                  </div>
                  <div className="space-y-px sm:space-y-0.5">
                    {timeline.slice(0, DAY_CELL_VISIBLE_LIMIT).map((item) =>
                      renderTimelineItem(item, colorRules, openEdit, true)
                    )}
                    {timeline.length > DAY_CELL_VISIBLE_LIMIT && (
                      <div className="text-[9px] sm:text-[10px] font-bold text-teal-700 leading-none px-px sm:px-1 truncate">
                        +{timeline.length - DAY_CELL_VISIBLE_LIMIT}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {dayDetailDate && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] overflow-hidden">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900">
                  {dayDetailDate} の{calendarViewMode === 'appointment' ? '予約' : '予約以外'}一覧
                </h3>
                <p className="text-xs text-gray-500">
                  {clinicScope === 'all' ? '全院' : clinicScope === 'takatsuki' ? '高槻院' : '川西'} /{' '}
                  {calendarViewMode === 'appointment' ? dayDetailTimeline.length : dayDetailRows.length}件
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCreate(dayDetailDate)}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-white text-sm font-bold ${
                    calendarViewMode === 'appointment' ? 'bg-teal-600' : 'bg-violet-600'
                  }`}
                >
                  <Plus size={16} />
                  この日に{calendarViewMode === 'appointment' ? '予約追加' : '予定追加'}
                </button>
                <ModalCloseButton onClick={() => setDayDetailDate(null)} />
              </div>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto max-h-[72vh]">
              {dayDetailTimeline.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-gray-500">
                  この日の表示対象はありません。
                </div>
              ) : (
                dayDetailTimeline.map((item) => {
                  if (item.kind === 'blocked') {
                    return (
                      <div
                        key={item.blocked.id}
                        className={`w-full rounded-xl border px-3 py-2 text-left shadow-sm ${blockedChipClass()}`}
                      >
                        <div className="font-bold text-sm">{blockedChipLabel(item.blocked)}</div>
                        <div className="text-xs mt-1 text-zinc-300">休憩・予約不可（マスター設定・編集不可）</div>
                      </div>
                    );
                  }
                  if (item.kind === 'gap') {
                    return (
                      <div
                        key={item.gap.id}
                        className={`w-full rounded-xl border px-3 py-2 text-left shadow-sm ${gapChipClass()}`}
                      >
                        <div className="font-bold text-sm">{gapChipLabel(item.gap)}</div>
                        <div className="text-xs mt-1">空白 {item.gap.minutes}分（自動表示・編集不可）</div>
                      </div>
                    );
                  }
                  const r = item.reservation as ReservationWithCustomer;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openEdit(r)}
                      className={`w-full rounded-xl border px-3 py-2 text-left shadow-sm ${chipClass(r, colorRules)}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {isAppointmentEntry(r) ? (
                          <>
                            <div className="font-bold text-sm">
                              {String(r.start_time).slice(0, 5)}〜{String(r.end_time).slice(0, 5)}{' '}
                              {chipLabel(r).replace(String(r.start_time).slice(0, 5), '').trim()}
                            </div>
                            <div className="text-xs font-bold">{processStatusBadge(r)}</div>
                          </>
                        ) : (
                          <div className="min-w-0">
                            <div className="font-bold text-base">{personalScheduleTitle(r)}</div>
                            <div className="text-xs mt-0.5 opacity-80">
                              {String(r.start_time).slice(0, 5)}〜{String(r.end_time).slice(0, 5)}
                            </div>
                          </div>
                        )}
                      </div>
                      {r.memo && (
                        <div className="mt-1 text-xs opacity-80 whitespace-pre-wrap">{r.memo}</div>
                      )}
                      <div className="mt-1 text-[11px] opacity-70">タップで編集</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {visitHistoryCustomer && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900">過去の来院一覧</h3>
                <p className="text-xs text-gray-500">
                  {visitHistoryCustomer.customer_number || '番号なし'} / {visitHistoryCustomer.name}
                  {visitHistoryCustomer.name_kana ? `（${visitHistoryCustomer.name_kana}）` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenCustomerChart(visitHistoryCustomer)}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700"
                >
                  個人カルテへ
                </button>
                <ModalCloseButton onClick={() => setVisitHistoryCustomer(null)} />
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[76vh]">
              {visitHistoryLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">読み込み中...</div>
              ) : visitHistoryError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  来院履歴の取得に失敗しました: {visitHistoryError}
                </div>
              ) : visitHistoryRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-gray-500">
                  来院履歴はありません。
                </div>
              ) : (
                <div>
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-10" />
                      <col className="w-[34%]" />
                      <col className="w-[24%]" />
                      <col className="w-16" />
                      <col className="w-24" />
                    </colgroup>
                    <thead>
                      <tr className="border-b bg-slate-50 text-xs text-gray-600">
                        <th className="px-1 py-2 text-left">No.</th>
                        <th className="px-2 py-2 text-left">来院日・内容</th>
                        <th className="px-2 py-2 text-left">メモ</th>
                        <th className="px-2 py-2 text-left">担当</th>
                        <th className="px-2 py-2 text-right">支払金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitHistoryRows.map((v, idx) => (
                        <tr key={v.id} className="border-b last:border-0 align-top">
                          <td className="px-1 py-2 font-bold text-gray-500">{idx + 1}</td>
                          <td className="px-2 py-2 overflow-hidden">
                            <div className="font-bold text-gray-900">{String(v.visit_date || '').slice(0, 10) || '-'}</div>
                            <div className="truncate text-xs text-gray-600">
                              {v.menu_name || 'メニュー未設定'}
                              {v.import_kind_text ? ` / ${v.import_kind_text}` : ''}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-xs text-gray-700">
                            <div className="line-clamp-2 whitespace-pre-wrap break-words">
                            {String(v.memo || '').trim() || '-'}
                            </div>
                          </td>
                          <td className="truncate px-2 py-2 text-gray-700">{v.staff_name || '-'}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-bold text-emerald-700">
                            {formatAmount(v.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {editing
                  ? isAppointmentEntry(editing)
                    ? '予約を修正'
                    : '予定を修正'
                  : formEntryKind === 'appointment'
                    ? '予約を追加'
                    : '予定を追加'}
              </h3>
              <ModalCloseButton onClick={closeReservationEditor} />
            </div>
            <div className="p-4 space-y-3 text-sm" {...reservationFormInputProps}>
              {formEntryKind === 'appointment' ? (
                <>
                  <CustomerSearchPanel
                    accent="blue"
                    selectedCustomer={selectedCustomer}
                    onSelect={handleSelectCustomer}
                    onClearSelection={() => {
                      setSelectedCustomer(null);
                      setVisitHistoryCustomer(null);
                      setVisitHistoryRows([]);
                    }}
                  />
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={() => void openVisitHistory(selectedCustomer)}
                      className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                    >
                      履歴を確認する
                    </button>
                  )}
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
                    <label className="block text-xs font-bold text-gray-600 mb-1">表示名</label>
                    <input
                      type="text"
                      value={formBlockTitle}
                      onChange={(e) => setFormBlockTitle(e.target.value)}
                      placeholder="例: 渉外 / 昼休み / 会議（カレンダーにこの文字だけ出ます）"
                      className="w-full border rounded-lg px-2 py-2 text-base font-medium"
                      lang="ja"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">メモ（詳細・カレンダーには表示しません）</label>
                    <textarea
                      value={formMemo}
                      onChange={(e) => setFormMemo(e.target.value)}
                      rows={3}
                      placeholder="場所・相手・備考など"
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
                  <FlexibleTimeInput
                    value={formStart}
                    onChange={setFormStart}
                    ariaLabel="予約開始時刻"
                    className="w-full border rounded-lg px-2 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">終了</label>
                  <FlexibleTimeInput
                    value={formEnd}
                    onChange={setFormEnd}
                    ariaLabel="予約終了時刻"
                    className="w-full border rounded-lg px-2 py-2"
                  />
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
                    <option value="scheduled">未処理</option>
                    <option value="visited">済（来院入力済）</option>
                    <option value="cancelled">取消</option>
                  </select>
                </div>
              )}
              {formEntryKind === 'appointment' && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">メモ</label>
                  <textarea
                    value={formMemo}
                    onChange={(e) => setFormMemo(e.target.value)}
                    rows={2}
                    className="w-full border rounded-lg px-2 py-2"
                    lang="ja"
                  />
                </div>
              )}
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
                  <button
                    type="button"
                    onClick={() => openVisit(editing)}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white font-bold"
                  >
                    <Stethoscope size={16} />
                    来院入力へ
                  </button>
                )}
                {editing && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteReservation()}
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-300 text-red-700 font-bold disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    削除
                  </button>
                )}
              </div>
              {editing && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Pencil size={12} />
                  {isAppointmentEntry(editing)
                    ? `${statusLabel(editing.status)} / ${editing.start_time.slice(0, 5)}〜${editing.end_time.slice(0, 5)}`
                    : `${editing.start_time.slice(0, 5)}〜${editing.end_time.slice(0, 5)}`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {otherPasswordModalOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border-2 border-violet-200">
            <h3 className="text-lg font-bold text-gray-900 mb-1">予約以外（個人予定）へ入室</h3>
            <p className="text-sm text-gray-600 mb-3">
              経営ルール設定で登録した<strong>入室パスワード</strong>を入力（合言葉ではありません）。
              目のアイコンで入力を確認できます。
            </p>
            <SecretInputField
              label="入室パスワード"
              hint={OTHER_CAL_PASSWORD_HINT}
              value={otherPasswordInput}
              onChange={(v) => {
                setOtherPasswordInput(v);
                setOtherPasswordError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitOtherPassword();
              }}
              placeholder="設定画面で保存したパスワード"
              inputClassName="border-2 border-violet-300 rounded-lg w-full"
              autoFocus
            />
            {otherPasswordError && <p className="text-sm text-red-700 font-bold mb-2">{otherPasswordError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOtherPasswordModalOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 font-bold text-gray-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={submitOtherPassword}
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white font-bold"
              >
                入室
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
