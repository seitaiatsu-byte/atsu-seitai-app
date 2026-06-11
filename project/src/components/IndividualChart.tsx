import { useState, useEffect, useMemo, useCallback } from 'react';
import { guardNavigation, useFormInputTouched, useUnsavedFormGuard } from '../lib/unsavedFormGuard';
import { ChevronDown, ChevronRight, Download, Edit2, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
import JapaneseTextarea from './JapaneseTextarea';
import CustomerRosterEditModal from './CustomerRosterEditModal';
import ModalCloseButton from './ModalCloseButton';
import { getCustomerBirthDate } from '../lib/customerBirthday';
import {
  formatTableCell,
  getAgeYearsFromCustomer,
  getChiefComplaint1Display,
  getChiefTripletWithVisitMenu,
  getInflowLineForChart,
  getPhoneWithFallbackMeta,
} from '../lib/customerDisplayFields';
import { getKanaForRoster, getMemoForRoster, type CustomerRowRecord } from '../lib/customerRosterFieldResolve';
import { fetchBusinessRules } from '../lib/businessRules';
import {
  computeCustomerLtvMetrics,
  formatCustomerLtvPeriodLabel,
  resolveCustomerLtvPeriod,
  type CustomerLtvPeriodMode,
} from '../lib/customerChartMetrics';
import {
  filterQualifyingVisits,
  firstQualifyingVisitDate,
  qualifyingVisitRepeatCount,
} from '../lib/repeatMetrics';
import { formatPaymentDetailLabel, formatPaymentMethodLabel, looksLikeUuid, mergeIdNameMaps } from '../lib/paymentDisplay';
import { recalcBeEquivalentCountsForCustomers } from '../lib/beEquivalentRecalc';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';
import { CLINIC_OPTIONS, clinicNameToShortLabel, type ClinicFullName } from '../lib/clinic';
import {
  isMissingImportKindTextColumnError,
  legacyImportKindLabel,
  resolvePaymentDetailIdFromKindLabel,
  resolveVisitMenuNameForSave,
  stripKindPrefixFromMemo,
  visitUpdateOmittingImportKindText,
} from '../lib/visitRecordKindCompat';

type Customer = Database['public']['Tables']['customers']['Row'];
type VisitRow = Database['public']['Tables']['visit_records']['Row'];
type ProductRow = Database['public']['Tables']['product_sales']['Row'];
type SubRow = Database['public']['Tables']['subscription_records']['Row'];
type MenuMaster = Database['public']['Tables']['menu_master']['Row'];

type TimelineItem = {
  id: string;
  kind: 'visit' | 'product' | 'subscription';
  date: string;
  label: string;
  sublabel: string;
  amount: number;
  visitOrdinal?: number;
  isFirstVisit?: boolean;
  visitRecord?: VisitRow;
};

type MediaEntry = {
  visitId: string;
  visitDate: string;
  url: string;
};

type ChartSummaryPanel = 'maintenance' | 'product' | 'subscription' | null;
type ActiveChartRow = {
  customer: Customer;
  latestVisitDate: string | null;
  daysSinceLatestVisit: number | null;
  latestMenu: string;
  ltv: number;
  route: string;
  symptom: string;
};

type ActiveSortKey = 'number' | 'age' | 'symptom' | 'route' | 'menu' | 'ltv' | 'latest';
const ACTIVE_RANGE_MAX = 360;

function formatDateJaYmd(s: string | null | undefined): string {
  const t = (s || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '—';
  return new Date(`${t}T12:00:00`).toLocaleDateString('ja-JP');
}

function compactMemo(raw: string | null | undefined): string {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '—';
  return s.length > 18 ? `${s.slice(0, 18)}…` : s;
}

function compactField(raw: string | null | undefined, max = 10): string {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatLtvCompact(ltv: number): string {
  const n = Math.round(ltv);
  if (n >= 10000) {
    const man = n / 10000;
    return `¥${Number.isInteger(man) ? man : man.toFixed(1)}万`;
  }
  return `¥${n.toLocaleString()}`;
}

function formatActiveDateShort(date: string | null, days: number | null): string {
  if (!date) return '来院なし';
  const d = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [, m, day] = d.split('-');
  const md = `${Number(m)}/${Number(day)}`;
  return days != null ? `${md}(${days}日)` : md;
}

function visitTimelineMenuLabel(v: VisitRow, detailIdToName: Record<string, string>): string {
  const menu = (v.menu_name || '').trim();
  if (menu) return menu;
  const pd = formatPaymentDetailLabel(v.payment_detail_id, detailIdToName, v.import_kind_text, v.memo);
  if (pd && pd !== '-') return pd;
  return '—';
}

/** 修正モーダル用: menu_name / 取込種類をマスタ名と突き合わせ、プルダウンと二重にならないよう id を優先 */
function resolveVisitEditMenuSelection(
  v: VisitRow,
  menus: MenuMaster[]
): { menuId: string; menuName: string } {
  if (v.menu_id) {
    const byId = menus.find((m) => m.id === v.menu_id);
    if (byId) return { menuId: byId.id, menuName: byId.name };
  }
  const legacyKind = (legacyImportKindLabel(v) || '').trim();
  const candidates = [(v.menu_name || '').trim(), legacyKind].filter(Boolean);
  for (const name of candidates) {
    const hit = menus.find((m) => m.name === name);
    if (hit) return { menuId: hit.id, menuName: hit.name };
  }
  const fallback = (v.menu_name || '').trim() || legacyKind;
  return { menuId: '', menuName: fallback };
}

export default function IndividualChart({
  initialCustomer = null,
  backToListSignal = 0,
  onDetailChange,
}: {
  initialCustomer?: Customer | null;
  /** 増えると一覧表示に戻す（ヘッダー戻る用） */
  backToListSignal?: number;
  onDetailChange?: (inDetail: boolean) => void;
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [paymentMethodNames, setPaymentMethodNames] = useState<Record<string, string>>({});
  const [paymentDetailNames, setPaymentDetailNames] = useState<Record<string, string>>({});
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<{ id: string; name: string }[]>([]);
  const [paymentDetailOptions, setPaymentDetailOptions] = useState<{ id: string; name: string }[]>([]);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [menuOptions, setMenuOptions] = useState<MenuMaster[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [menuDurationRules, setMenuDurationRules] = useState('');
  const [defaultTreatmentMinutes, setDefaultTreatmentMinutes] = useState(60);
  const [ltvPeriodMode, setLtvPeriodMode] = useState<CustomerLtvPeriodMode>('all');
  const [ltvCustomStart, setLtvCustomStart] = useState('');
  const [ltvCustomEnd, setLtvCustomEnd] = useState('');
  const [referral1FromMaster, setReferral1FromMaster] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState<ChartSummaryPanel>(null);
  const [activeRows, setActiveRows] = useState<ActiveChartRow[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [checkedActiveIds, setCheckedActiveIds] = useState<Set<string>>(new Set());
  const [activeSort, setActiveSort] = useState<{ key: ActiveSortKey; dir: 'asc' | 'desc' }>({
    key: 'latest',
    dir: 'asc',
  });
  const [editingVisit, setEditingVisit] = useState<VisitRow | null>(null);
  const {
    isTouched: visitEditTouched,
    clearTouched: clearVisitEditTouched,
    markTouched: markVisitEditTouched,
    formInputProps: visitEditFormInputProps,
  } = useFormInputTouched(Boolean(editingVisit));
  useUnsavedFormGuard('chart-visit-edit', Boolean(editingVisit) && visitEditTouched);
  const [editVisitDate, setEditVisitDate] = useState('');
  const [editVisitAmount, setEditVisitAmount] = useState('');
  const [editVisitClinic, setEditVisitClinic] = useState<ClinicFullName>(CLINIC_OPTIONS[0].value);
  const [editVisitStaffId, setEditVisitStaffId] = useState('');
  const [editVisitPaymentDetailId, setEditVisitPaymentDetailId] = useState('');
  const [editVisitMenuId, setEditVisitMenuId] = useState('');
  const [editVisitMenuName, setEditVisitMenuName] = useState('');
  const [editVisitTicketRaw, setEditVisitTicketRaw] = useState('');
  const [editVisitKindLegacy, setEditVisitKindLegacy] = useState('');
  const [editVisitPaymentMethod, setEditVisitPaymentMethod] = useState('');
  const [editVisitMemo, setEditVisitMemo] = useState('');
  const [savingVisitEdit, setSavingVisitEdit] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<MediaEntry | null>(null);
  const [customerInfoEditOpen, setCustomerInfoEditOpen] = useState(false);

  const resolvePaymentMethodForEdit = useCallback(
    (raw: string | null | undefined) => {
      const s = String(raw ?? '').trim();
      if (!s) return '';
      if (looksLikeUuid(s)) return s;
      const hit = paymentMethodOptions.find((m) => m.name === s);
      return hit?.id ?? s;
    },
    [paymentMethodOptions]
  );

  useEffect(() => {
    fetchBusinessRules().then((r) => {
      setExcludeKeywords(r.excludeKeywords);
      setMenuDurationRules(r.menuDurationRules);
      setDefaultTreatmentMinutes(r.defaultTreatmentMinutes);
    });
  }, []);

  useEffect(() => {
    if (initialCustomer) setSelectedCustomer(initialCustomer);
  }, [initialCustomer?.id]);

  useEffect(() => {
    if (!backToListSignal) return;
    setSelectedCustomer(null);
  }, [backToListSignal]);

  useEffect(() => {
    onDetailChange?.(Boolean(selectedCustomer));
  }, [selectedCustomer, onDetailChange]);

  useEffect(() => {
    if (!selectedCustomer) {
      setReferral1FromMaster(null);
      return;
    }
    const id = selectedCustomer.referral_source_id;
    if (!id) {
      setReferral1FromMaster(null);
      return;
    }
    let cancel = false;
    void (async () => {
      const { data } = await supabase
        .from('referral_source_master')
        .select('name')
        .eq('id', id)
        .maybeSingle();
      if (!cancel) setReferral1FromMaster((data as { name: string } | null)?.name ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCustomer?.id, selectedCustomer?.referral_source_id]);

  /** 一覧のキャッシュ行では列が古い/欠けることがあるため、カルテ表示前に API から最新1行を取得。 */
  useEffect(() => {
    const id = selectedCustomer?.id;
    if (!id) return;
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
      if (cancel) return;
      if (error) {
        if (import.meta.env.DEV) {
          console.error(
            '[個人カルテ] 顧客1件の再取得に失敗（表示は検索時の行のまま）:',
            error.message,
            error
          );
        }
        return;
      }
      if (!data) return;
      setSelectedCustomer((prev) => (prev && prev.id === id ? (data as Customer) : prev));
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCustomer?.id]);

  const loadCustomerData = useCallback(async () => {
    if (!selectedCustomer) return;
    const [{ data: v }, { data: p }, { data: s }, { data: pm }, { data: pd }, { data: menus }, { data: staff }] =
      await Promise.all([
      supabase.from('visit_records').select('*').eq('customer_id', selectedCustomer.id).order('visit_date', { ascending: false }),
      supabase.from('product_sales').select('*').eq('customer_id', selectedCustomer.id).order('sale_date', { ascending: false }),
      supabase.from('subscription_records').select('*').eq('customer_id', selectedCustomer.id).order('start_date', { ascending: false }),
      supabase.from('payment_method_master').select('id, name'),
      supabase.from('payment_detail_master').select('id, name'),
      supabase.from('menu_master').select('*').eq('is_active', true).order('display_order'),
      supabase.from('staff_master').select('id, name').eq('is_active', true).order('display_order'),
    ]);
    setVisits(v || []);
    setProducts(p || []);
    setSubs(s || []);
    const merged = mergeIdNameMaps(pm as { id: string; name: string }[], pd as { id: string; name: string }[]);
    setPaymentMethodNames(merged);
    setPaymentDetailNames(merged);
    setPaymentMethodOptions((pm || []) as { id: string; name: string }[]);
    setPaymentDetailOptions((pd || []) as { id: string; name: string }[]);
    setStaffOptions((staff || []) as { id: string; name: string }[]);
    setMenuOptions((menus || []) as MenuMaster[]);
  }, [selectedCustomer]);

  const loadActiveChartRows = useCallback(async () => {
    setActiveLoading(true);
    const [{ data: customers }, { data: vRows }, { data: pRows }, { data: sRows }] = await Promise.all([
      supabase.from('customers').select('*').order('customer_number', { ascending: true }),
      supabase.from('visit_records').select('id, customer_id, visit_date, amount, menu_name'),
      supabase.from('product_sales').select('customer_id, amount'),
      supabase.from('subscription_records').select('customer_id, amount'),
    ]);

    const visits = (vRows || []) as Pick<VisitRow, 'id' | 'customer_id' | 'visit_date' | 'amount' | 'menu_name'>[];
    const products = (pRows || []) as Pick<ProductRow, 'customer_id' | 'amount'>[];
    const subsRows = (sRows || []) as Pick<SubRow, 'customer_id' | 'amount'>[];
    const customerRows = (customers || []) as Customer[];

    const latestVisitByCustomer = new Map<string, string>();
    const latestMenuByCustomer = new Map<string, string>();
    const ltvByCustomer = new Map<string, number>();
    const now = new Date();

    visits.forEach((v) => {
      const cur = latestVisitByCustomer.get(v.customer_id);
      if (!cur || String(v.visit_date) > cur) {
        latestVisitByCustomer.set(v.customer_id, String(v.visit_date));
        latestMenuByCustomer.set(v.customer_id, String(v.menu_name || '').trim() || '—');
      }
      ltvByCustomer.set(v.customer_id, (ltvByCustomer.get(v.customer_id) || 0) + Number(v.amount || 0));
    });
    products.forEach((p) => {
      ltvByCustomer.set(p.customer_id, (ltvByCustomer.get(p.customer_id) || 0) + Number(p.amount || 0));
    });
    subsRows.forEach((s) => {
      ltvByCustomer.set(s.customer_id, (ltvByCustomer.get(s.customer_id) || 0) + Number(s.amount || 0));
    });

    const rows: ActiveChartRow[] = customerRows
      .map((c) => {
        const latest = latestVisitByCustomer.get(c.id) || null;
        const daysSince = latest
          ? Math.floor((now.getTime() - new Date(`${latest}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          customer: c,
          latestVisitDate: latest,
          daysSinceLatestVisit: daysSince,
          latestMenu: latestMenuByCustomer.get(c.id) || '—',
          ltv: ltvByCustomer.get(c.id) || 0,
          route: getInflowLineForChart(c, null, [])?.line || '—',
          symptom: getChiefComplaint1Display(c) || '—',
        };
      })
      .filter((row) => row.daysSinceLatestVisit != null && row.daysSinceLatestVisit >= 0 && row.daysSinceLatestVisit <= ACTIVE_RANGE_MAX)
      .sort((a, b) => {
        const ad = a.daysSinceLatestVisit ?? Number.MAX_SAFE_INTEGER;
        const bd = b.daysSinceLatestVisit ?? Number.MAX_SAFE_INTEGER;
        if (ad !== bd) return ad - bd;
        return (b.ltv || 0) - (a.ltv || 0);
      });

    setActiveRows(rows);
    setActiveLoading(false);
  }, []);

  const reloadSelectedCustomer = useCallback(async () => {
    const id = selectedCustomer?.id;
    if (!id) return;
    const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    if (error || !data) return;
    setSelectedCustomer(data as Customer);
  }, [selectedCustomer?.id]);

  const handleCustomerInfoSaved = useCallback(async () => {
    await reloadSelectedCustomer();
    await loadCustomerData();
    void loadActiveChartRows();
  }, [reloadSelectedCustomer, loadCustomerData, loadActiveChartRows]);

  useEffect(() => {
    void loadCustomerData();
  }, [loadCustomerData]);

  useEffect(() => {
    void loadActiveChartRows();
  }, [loadActiveChartRows]);

  useEffect(() => {
    setSummaryOpen(null);
    setLtvPeriodMode('all');
    setLtvCustomStart('');
    setLtvCustomEnd('');
  }, [selectedCustomer?.id]);

  /** メニューマスタ読込後に id を同期（開いた直後は options 未読込で二重 option になるのを防ぐ） */
  useEffect(() => {
    if (!editingVisit || !editVisitMenuName) return;
    const hit = menuOptions.find((m) => m.name === editVisitMenuName);
    if (hit && editVisitMenuId !== hit.id) {
      setEditVisitMenuId(hit.id);
    }
  }, [editingVisit?.id, menuOptions, editVisitMenuName, editVisitMenuId]);

  useEffect(() => {
    const onRecordsUpdated = () => {
      void loadCustomerData();
      void loadActiveChartRows();
    };
    window.addEventListener('records-updated', onRecordsUpdated);
    return () => window.removeEventListener('records-updated', onRecordsUpdated);
  }, [loadCustomerData, loadActiveChartRows]);

  const ltvPeriodRange = useMemo(
    () =>
      resolveCustomerLtvPeriod({
        mode: ltvPeriodMode,
        customStart: ltvCustomStart,
        customEnd: ltvCustomEnd,
      }),
    [ltvPeriodMode, ltvCustomStart, ltvCustomEnd]
  );

  const ltvMetrics = useMemo(
    () =>
      computeCustomerLtvMetrics({
        visits,
        products,
        subs,
        startYmd: ltvPeriodRange.startYmd,
        endYmd: ltvPeriodRange.endYmd,
        menuDurationRules,
        defaultTreatmentMinutes,
      }),
    [visits, products, subs, ltvPeriodRange, menuDurationRules, defaultTreatmentMinutes]
  );

  const totalLtv = ltvMetrics.ltvTotal;
  const ltvPeriodLabel = formatCustomerLtvPeriodLabel(ltvPeriodRange.startYmd, ltvPeriodRange.endYmd);

  const visitOrdinalById = useMemo(() => {
    const sortedAsc = [...visits].sort((a, b) => {
      const d = String(a.visit_date).localeCompare(String(b.visit_date));
      if (d !== 0) return d;
      return String(a.id).localeCompare(String(b.id));
    });
    const map = new Map<string, number>();
    sortedAsc.forEach((v, i) => map.set(v.id, i + 1));
    return map;
  }, [visits]);

  const firstVisitId = useMemo(() => {
    const first = [...visits]
      .sort((a, b) => String(a.visit_date).localeCompare(String(b.visit_date)) || String(a.id).localeCompare(String(b.id)))[0];
    return first?.id ?? null;
  }, [visits]);

  const timeline: TimelineItem[] = useMemo(() => {
    const rows: TimelineItem[] = [];
    visits.forEach((v) => {
      const pm = formatPaymentMethodLabel(v.payment_method, paymentMethodNames);
      const pd = formatPaymentDetailLabel(v.payment_detail_id, paymentDetailNames, v.import_kind_text, v.memo);
      rows.push({
        id: `v-${v.id}`,
        kind: 'visit',
        date: v.visit_date,
        label: '来院',
        sublabel: [
          firstVisitId === v.id ? '初回' : null,
          `実通院${visitOrdinalById.get(v.id) || 0}回`,
          v.menu_name,
          pd !== '-' ? pd : null,
          pm !== '-' ? pm : null,
        ]
          .filter(Boolean)
          .join(' / '),
        amount: Number(v.amount || 0),
        visitOrdinal: visitOrdinalById.get(v.id),
        isFirstVisit: firstVisitId === v.id,
        visitRecord: v,
      });
    });
    products.forEach((p) => {
      const pm = formatPaymentMethodLabel(p.payment_method, paymentMethodNames);
      const qty = Number(p.quantity || 0);
      const amount = Number(p.amount || 0);
      const unit = qty > 0 ? Math.round(amount / qty) : 0;
      rows.push({
        id: `p-${p.id}`,
        kind: 'product',
        date: p.sale_date,
        label: '物販',
        sublabel: `${p.product_name || '商品'} ×${p.quantity} @¥${unit.toLocaleString()} / ${pm}`,
        amount,
      });
    });
    subs.forEach((s) => {
      const pm = formatPaymentMethodLabel(s.payment_method, paymentMethodNames);
      rows.push({
        id: `s-${s.id}`,
        kind: 'subscription',
        date: s.start_date,
        label: 'サブスク',
        sublabel: `${s.subscription_name || 'プラン'} / ${pm}`,
        amount: Number(s.amount || 0),
      });
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [visits, products, subs, paymentMethodNames, paymentDetailNames, visitOrdinalById, firstVisitId]);

  const toggleActiveChecked = (customerId: string) => {
    setCheckedActiveIds((prev) => {
      const n = new Set(prev);
      if (n.has(customerId)) n.delete(customerId);
      else n.add(customerId);
      return n;
    });
  };

  const latestVisitColorClass = (days: number | null) => {
    if (days == null) return 'text-gray-500';
    if (days <= 89) return 'text-blue-700 font-bold';
    if (days <= 119) return 'text-yellow-700 font-bold';
    if (days <= 179) return 'text-orange-700 font-bold';
    return 'text-slate-500 font-bold';
  };

  const activeRowBgClass = (days: number | null) => {
    if (days == null) return 'bg-white';
    if (days <= 89) return 'bg-blue-50';
    if (days <= 119) return 'bg-yellow-50';
    if (days <= 179) return 'bg-orange-50';
    return 'bg-slate-100';
  };

  const toggleActiveSort = (key: ActiveSortKey) => {
    setActiveSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const sortMark = (key: ActiveSortKey) => {
    if (activeSort.key !== key) return '↕';
    return activeSort.dir === 'asc' ? '▲' : '▼';
  };

  const sortedActiveRows = useMemo(() => {
    const rows = [...activeRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (activeSort.key === 'number') {
        const an = Number(String(a.customer.customer_number || '').replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER;
        const bn = Number(String(b.customer.customer_number || '').replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER;
        cmp = an - bn;
      } else if (activeSort.key === 'age') {
        const an = getAgeYearsFromCustomer(a.customer) ?? -1;
        const bn = getAgeYearsFromCustomer(b.customer) ?? -1;
        cmp = an - bn;
      } else if (activeSort.key === 'symptom') {
        cmp = String(a.symptom || '').localeCompare(String(b.symptom || ''), 'ja');
      } else if (activeSort.key === 'route') {
        cmp = String(a.route || '').localeCompare(String(b.route || ''), 'ja');
      } else if (activeSort.key === 'menu') {
        cmp = String(a.latestMenu || '').localeCompare(String(b.latestMenu || ''), 'ja');
      } else if (activeSort.key === 'ltv') {
        cmp = (a.ltv || 0) - (b.ltv || 0);
      } else if (activeSort.key === 'latest') {
        const ad = a.daysSinceLatestVisit ?? Number.MAX_SAFE_INTEGER;
        const bd = b.daysSinceLatestVisit ?? Number.MAX_SAFE_INTEGER;
        cmp = ad - bd;
      }
      return activeSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [activeRows, activeSort]);

  const openVisitEdit = (v: VisitRow) => {
    clearVisitEditTouched();
    setEditingVisit(v);
    setEditVisitDate(String(v.visit_date || '').slice(0, 10));
    setEditVisitAmount(String(Number(v.amount || 0)));
    setEditVisitClinic(
      (CLINIC_OPTIONS.some((c) => c.value === v.clinic_name)
        ? v.clinic_name
        : CLINIC_OPTIONS[0].value) as ClinicFullName
    );
    setEditVisitStaffId(staffOptions.find((s) => s.name === v.staff_name)?.id || '');
    const legacyKind = legacyImportKindLabel(v) || '';
    setEditVisitKindLegacy(legacyKind);
    if (v.payment_detail_id && looksLikeUuid(String(v.payment_detail_id))) {
      setEditVisitPaymentDetailId(String(v.payment_detail_id));
    } else if (legacyKind) {
      setEditVisitPaymentDetailId(
        resolvePaymentDetailIdFromKindLabel(legacyKind, paymentDetailOptions) || ''
      );
    } else {
      setEditVisitPaymentDetailId('');
    }
    const menuSel = resolveVisitEditMenuSelection(v, menuOptions);
    setEditVisitMenuId(menuSel.menuId);
    setEditVisitMenuName(menuSel.menuName);
    setEditVisitTicketRaw(
      (v.import_ticket_count_raw && String(v.import_ticket_count_raw).trim()) ||
        (v.points_used != null && v.points_used !== 0 ? String(v.points_used) : '')
    );
    setEditVisitPaymentMethod(resolvePaymentMethodForEdit(v.payment_method));
    setEditVisitMemo(stripKindPrefixFromMemo(v.memo) || '');
  };

  const saveVisitEdit = async () => {
    if (!editingVisit || !selectedCustomer) return;
    const amount = Number(editVisitAmount);
    if (!editVisitDate || !Number.isFinite(amount)) {
      alert('来院日と金額を正しく入力してください');
      return;
    }
    const menuObj =
      menuOptions.find((m) => m.id === editVisitMenuId) ||
      menuOptions.find((m) => m.name === editVisitMenuName);
    const staffObj = staffOptions.find((s) => s.id === editVisitStaffId);
    const detailObj = paymentDetailOptions.find((d) => d.id === editVisitPaymentDetailId);
    const menuNameResolved = resolveVisitMenuNameForSave({
      menuMasterName: menuObj?.name,
      menuFreeText: menuObj ? '' : editVisitMenuName,
      paymentDetailName: detailObj?.name,
      legacyKindLabel: editVisitKindLegacy,
    });
    const pmResolved = resolvePaymentMethodForEdit(editVisitPaymentMethod);
    const cleanedMemo = stripKindPrefixFromMemo(editVisitMemo) ?? (editVisitMemo.trim() || null);
    const ticketTrim = editVisitTicketRaw.trim();
    const paymentDetailId = editVisitPaymentDetailId || null;
    const basePayload = {
      visit_date: editVisitDate,
      amount,
      clinic_name: editVisitClinic,
      staff_name: staffObj?.name || null,
      payment_method: pmResolved || null,
      payment_detail_id: paymentDetailId,
      import_kind_text: paymentDetailId ? null : editingVisit.import_kind_text ?? null,
      menu_id: menuObj?.id ?? null,
      menu_name: menuNameResolved,
      import_ticket_count_raw: ticketTrim || null,
      memo: cleanedMemo,
    };
    setSavingVisitEdit(true);
    try {
      let { error } = await supabase.from('visit_records').update(basePayload).eq('id', editingVisit.id);
      if (error && isMissingImportKindTextColumnError(error)) {
        const retry = await supabase
          .from('visit_records')
          .update(visitUpdateOmittingImportKindText(basePayload))
          .eq('id', editingVisit.id);
        error = retry.error;
      }

      if (error) {
        alert(`修正に失敗しました: ${error.message}`);
        return;
      }

      const { data: saved, error: verifyErr } = await supabase
        .from('visit_records')
        .select('menu_name')
        .eq('id', editingVisit.id)
        .maybeSingle();
      if (verifyErr) {
        alert(`保存後の確認に失敗しました: ${verifyErr.message}`);
        return;
      }
      if (menuNameResolved && !(saved?.menu_name || '').trim()) {
        alert(
          'メニュー名がデータベースに保存されていません。Supabase の SQL Editor で visit_records の UPDATE 権限（RLS）を実行してください（下記SQLを貼り付け）。'
        );
        return;
      }

      await recalcBeEquivalentCountsForCustomers([selectedCustomer.id]);
      clearVisitEditTouched();
      setEditingVisit(null);
      window.dispatchEvent(new Event('records-updated'));
      await loadCustomerData();
      alert('来院履歴を修正しました');
    } finally {
      setSavingVisitEdit(false);
    }
  };

  const deleteVisit = async (v: VisitRow) => {
    if (!window.confirm('この来院履歴を削除しますか？')) return;
    const { error } = await supabase.from('visit_records').delete().eq('id', v.id);
    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    window.dispatchEvent(new Event('records-updated'));
    await loadCustomerData();
  };

  const productSummary = useMemo(() => {
    const lineCount = products.length;
    const qtyTotal = products.reduce((s, p) => s + Number(p.quantity || 0), 0);
    const amountTotal = products.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { lineCount, qtyTotal, amountTotal };
  }, [products]);

  const subscriptionSummary = useMemo(() => {
    const count = subs.length;
    const amountTotal = subs.reduce((s, x) => s + Number(x.amount || 0), 0);
    return { count, amountTotal };
  }, [subs]);

  const maintenanceSummary = useMemo(
    () => visits.reduce((s, v) => s + Number(v.maintenance_cost || 0), 0),
    [visits]
  );

  const visitsWithMaintenance = useMemo(
    () =>
      [...visits]
        .filter((v) => Number(v.maintenance_cost || 0) !== 0)
        .sort((a, b) => b.visit_date.localeCompare(a.visit_date)),
    [visits]
  );

  const allMediaEntries = useMemo<MediaEntry[]>(() => {
    const entries: MediaEntry[] = [];
    visits.forEach((v) => {
      (v.media_urls || []).forEach((u) => {
        entries.push({
          visitId: v.id,
          visitDate: v.visit_date,
          url: u,
        });
      });
    });
    return entries.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  }, [visits]);

  const removeMediaUrl = async (visitId: string, targetUrl: string) => {
    if (!window.confirm('この画像を削除してもよろしいですか？')) return;
    const row = visits.find((v) => v.id === visitId);
    if (!row) return;
    const nextUrls = (row.media_urls || []).filter((u) => u !== targetUrl);
    const { error } = await supabase.from('visit_records').update({ media_urls: nextUrls }).eq('id', visitId);
    if (error) {
      alert('画像削除に失敗しました');
      return;
    }
    setVisits((prev) => prev.map((v) => (v.id === visitId ? { ...v, media_urls: nextUrls } : v)));
  };

  const downloadMedia = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      const filename = url.split('/').pop() || 'media';
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  const visitLite = useMemo(
    () => visits.map((v) => ({ visit_date: v.visit_date, menu_name: v.menu_name })),
    [visits]
  );

  const firstQDate = firstQualifyingVisitDate(visitLite, excludeKeywords);
  const repeatVisitCount = qualifyingVisitRepeatCount(visitLite, excludeKeywords);
  const firstDayProductCount = useMemo(() => {
    if (!firstQDate) return 0;
    const day = firstQDate.slice(0, 10);
    return products.filter((p) => p.sale_date.slice(0, 10) === day).length;
  }, [firstQDate, products]);

  const qualifyingCount = filterQualifyingVisits(visitLite, excludeKeywords).length;

  const birth = selectedCustomer ? getCustomerBirthDate(selectedCustomer) : null;
  const age =
    selectedCustomer == null
      ? null
      : getAgeYearsFromCustomer(selectedCustomer);

  const inflowFromVisits = useMemo(
    () =>
      selectedCustomer
        ? getInflowLineForChart(selectedCustomer, referral1FromMaster, visits)
        : { line: null, note: null as 'customer' | 'master' | 'visit' | null },
    [selectedCustomer, referral1FromMaster, visits]
  );

  const phoneForChart = useMemo(
    () =>
      selectedCustomer
        ? getPhoneWithFallbackMeta(selectedCustomer, visits.map((v) => v.memo))
        : { value: null as string | null, fromRoster: true },
    [selectedCustomer, visits]
  );

  const chiefLines = useMemo(
    () =>
      selectedCustomer
        ? getChiefTripletWithVisitMenu(selectedCustomer, visits)
        : [null, null, null],
    [selectedCustomer, visits]
  );

  const rosterMemo = useMemo(
    () => (selectedCustomer ? getMemoForRoster(selectedCustomer as CustomerRowRecord) : null),
    [selectedCustomer]
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-sm:p-3 max-sm:rounded-xl">
      <h2 className="text-2xl max-sm:text-lg font-bold text-gray-800 mb-4 max-sm:mb-2">個人カルテ</h2>

      {!selectedCustomer ? (
        <div className="space-y-4">
          <CustomerSearchPanel
            accent="blue"
            selectedCustomer={null}
            onSelect={(c) => setSelectedCustomer(c)}
            onClearSelection={() => {}}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-gray-800">アクティブカルテ一覧</h3>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                {sortedActiveRows.length}枚
              </span>
            </div>
            {activeLoading ? (
              <div className="text-xs text-gray-500 py-4">読み込み中...</div>
            ) : (
              <div className="panel-scrollbar max-h-[34rem] overflow-y-auto">
                {/* スマホ: 1〜2行のコンパクト行 */}
                <div className="sm:hidden space-y-1">
                  {sortedActiveRows.map((r) => (
                    <button
                      key={r.customer.id}
                      type="button"
                      onClick={() => setSelectedCustomer(r.customer)}
                      className={`w-full text-left rounded-lg border border-slate-200 px-2 py-1.5 ${activeRowBgClass(r.daysSinceLatestVisit)}`}
                    >
                      <div className="flex items-center justify-between gap-1 leading-tight">
                        <div className="min-w-0 flex-1 text-[11px] font-bold text-slate-800 truncate">
                          <span className="text-slate-500 font-semibold">{r.customer.customer_number || '—'}</span>{' '}
                          {r.customer.name || '—'}
                          <span className="text-slate-600 font-normal ml-1">
                            {getAgeYearsFromCustomer(r.customer) ?? '—'}歳
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] font-bold text-blue-700">
                          {formatLtvCompact(r.ltv)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-600 leading-tight truncate">
                        {compactField(r.symptom, 8)} · {compactField(r.route, 6)} · {compactField(r.latestMenu, 12)} ·{' '}
                        <span className={latestVisitColorClass(r.daysSinceLatestVisit)}>
                          {formatActiveDateShort(r.latestVisitDate, r.daysSinceLatestVisit)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* PC: 表形式（列幅固定・省略） */}
                <table className="hidden sm:table w-full table-fixed text-[11px] sm:text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="text-left text-slate-700">
                      <th className="px-1 py-1.5 w-7"> </th>
                      <th className="px-1 py-1.5 w-[18%]">
                        <button type="button" onClick={() => toggleActiveSort('number')} className="font-bold">番号/氏名 {sortMark('number')}</button>
                      </th>
                      <th className="px-1 py-1.5 w-[6%]">
                        <button type="button" onClick={() => toggleActiveSort('age')} className="font-bold">年齢 {sortMark('age')}</button>
                      </th>
                      <th className="px-1 py-1.5 w-[14%]">
                        <button type="button" onClick={() => toggleActiveSort('symptom')} className="font-bold">症状 {sortMark('symptom')}</button>
                      </th>
                      <th className="px-1 py-1.5 w-[8%]">
                        <button type="button" onClick={() => toggleActiveSort('route')} className="font-bold">経路 {sortMark('route')}</button>
                      </th>
                      <th className="px-1 py-1.5 w-[16%]">
                        <button type="button" onClick={() => toggleActiveSort('menu')} className="font-bold">メニュー {sortMark('menu')}</button>
                      </th>
                      <th className="px-1 py-1.5 w-[12%] text-right">
                        <button type="button" onClick={() => toggleActiveSort('ltv')} className="font-bold">LTV {sortMark('ltv')}</button>
                      </th>
                      <th className="px-1 py-1.5 w-[18%]">
                        <button type="button" onClick={() => toggleActiveSort('latest')} className="font-bold">最新来院 {sortMark('latest')}</button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedActiveRows.map((r) => (
                      <tr
                        key={r.customer.id}
                        className={`border-b border-slate-100 cursor-pointer hover:brightness-[0.98] ${activeRowBgClass(r.daysSinceLatestVisit)}`}
                        onClick={() => setSelectedCustomer(r.customer)}
                      >
                        <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checkedActiveIds.has(r.customer.id)}
                            onChange={() => toggleActiveChecked(r.customer.id)}
                          />
                        </td>
                        <td className="px-1 py-1 font-semibold truncate">
                          <span className="text-slate-500">{r.customer.customer_number || '—'}</span>{' '}
                          <span className="text-slate-700">{r.customer.name || '—'}</span>
                        </td>
                        <td className="px-1 py-1 whitespace-nowrap">{getAgeYearsFromCustomer(r.customer) ?? '—'}歳</td>
                        <td className="px-1 py-1 truncate" title={r.symptom}>{compactField(r.symptom, 14)}</td>
                        <td className="px-1 py-1 truncate" title={r.route}>{compactField(r.route, 8)}</td>
                        <td className="px-1 py-1 truncate" title={r.latestMenu}>{compactField(r.latestMenu, 16)}</td>
                        <td className="px-1 py-1 text-right font-bold text-blue-700 whitespace-nowrap">{formatLtvCompact(r.ltv)}</td>
                        <td className={`px-1 py-1 truncate whitespace-nowrap ${latestVisitColorClass(r.daysSinceLatestVisit)}`}>
                          {formatActiveDateShort(r.latestVisitDate, r.daysSinceLatestVisit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap justify-end gap-2 mb-2">
            <button
              type="button"
              onClick={() => setCustomerInfoEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold border-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700 shadow-md"
            >
              <Edit2 size={18} aria-hidden />
              顧客情報を修正
            </button>
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl font-bold border bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X size={18} />
              別の顧客
            </button>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-2.5 mb-3 space-y-1.5">
            <p className="text-xs font-bold text-blue-900">登録情報（顧客登録と同じ項目・右上の青ボタンから修正）</p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                <div className="sm:col-span-2 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-gray-600">顧客番号:</span>
                  <span className="font-bold text-gray-900">{selectedCustomer.customer_number || '—'}</span>
                  <span className="text-base font-bold text-gray-900">{selectedCustomer.name}</span>
                  <span className="text-xs text-gray-600">{getKanaForRoster(selectedCustomer as CustomerRowRecord) ?? '—'}</span>
                </div>
                <div><span className="font-bold text-gray-600">性別:</span> <span className="font-bold">{selectedCustomer.gender || '-'}</span> / <span className="font-bold text-gray-600">年齢:</span> <span className="font-bold">{age != null ? `${age}歳` : '—'}</span></div>
                <div><span className="font-bold text-gray-600">生年月日:</span> <span className="font-bold">{birth ? new Date(birth).toLocaleDateString('ja-JP') : '-'}</span> / <span className="font-bold text-gray-600">電話:</span> <span className="font-bold">{phoneForChart.value ?? '—'}</span></div>
                <div className="sm:col-span-2 truncate"><span className="font-bold text-gray-600">住所:</span> <span className="font-bold">{[selectedCustomer.prefecture, selectedCustomer.city, selectedCustomer.town].filter(Boolean).join(' ') || '-'}</span></div>
                <div className="truncate"><span className="font-bold text-gray-600">主訴:</span> <span className="font-bold">{formatTableCell(chiefLines[0], '—')} / {formatTableCell(chiefLines[1], '—')} / {formatTableCell(chiefLines[2], '—')}</span></div>
                <div className="truncate"><span className="font-bold text-gray-600">流入:</span> <span className="font-bold">{inflowFromVisits.line ?? '—'}</span></div>
                <div><span className="font-bold text-gray-600">ポイント:</span> <span className="font-bold text-blue-600">{selectedCustomer.points ?? 0} pt</span> / <span className="font-bold text-gray-600">院:</span> <span className="font-bold"><ClinicNameFromCustomer customer={selectedCustomer} emptyLabel="—" /></span></div>
                {rosterMemo && (
                  <div className="truncate"><span className="font-bold text-gray-600">メモ:</span> <span className="font-bold text-gray-800">{rosterMemo}</span></div>
                )}
              </div>
            </div>

            <div className="bg-white/90 rounded-lg px-2.5 py-2 border border-violet-200 space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold text-violet-700">LTV・分単価（{ltvPeriodLabel}）</div>
                  <div className="text-2xl font-bold text-pink-900">¥{Math.round(totalLtv).toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    来院¥{Math.round(ltvMetrics.visitRevenue).toLocaleString()} / 物販¥
                    {Math.round(ltvMetrics.productRevenue).toLocaleString()} / サブスク¥
                    {Math.round(ltvMetrics.subscriptionRevenue).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-violet-700">実効分単価</div>
                  <div className="text-xl font-bold text-violet-900">
                    {ltvMetrics.yenPerMinute != null ? `¥${ltvMetrics.yenPerMinute.toLocaleString()}/分` : '—'}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    来院{ltvMetrics.visitCount}回 / 枠{ltvMetrics.totalMinutes.toLocaleString()}分
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-bold text-gray-600 shrink-0">期間:</span>
                {(
                  [
                    ['all', '全期間'],
                    ['last6m', '直近6ヶ月'],
                    ['last12m', '直近12ヶ月'],
                    ['custom', '期間指定'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLtvPeriodMode(mode)}
                    className={`px-2 py-0.5 rounded-full border font-bold transition-colors ${
                      ltvPeriodMode === mode
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-violet-800 border-violet-200 hover:bg-violet-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {ltvPeriodMode === 'custom' && (
                  <>
                    <input
                      type="date"
                      value={ltvCustomStart}
                      onChange={(e) => setLtvCustomStart(e.target.value)}
                      className="px-2 py-0.5 rounded border border-violet-200 text-xs"
                    />
                    <span className="text-gray-500">〜</span>
                    <input
                      type="date"
                      value={ltvCustomEnd}
                      onChange={(e) => setLtvCustomEnd(e.target.value)}
                      className="px-2 py-0.5 rounded border border-violet-200 text-xs"
                    />
                  </>
                )}
              </div>

              <p className="text-[10px] text-violet-900/80 leading-relaxed">
                分単価 ＝ 期間内の来院売上合計 ÷ 合計枠時間（分）。プログラム一括代＋毎回施術料も来院金額に入っていれば自動で反映されます。
                {ltvMetrics.estimatedMinutesCount > 0 && (
                  <span className="text-amber-800">
                    {' '}
                    枠時間未入力{ltvMetrics.estimatedMinutesCount}件はメニュー目安で推測。
                  </span>
                )}
                {ltvMetrics.skippedVisitCount > 0 && (
                  <span className="text-amber-800">
                    {' '}
                    金額あり・枠時間不明{ltvMetrics.skippedVisitCount}件は分単価から除外。
                  </span>
                )}
              </p>
            </div>

            <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-blue-200 text-xs text-gray-700 truncate">
              <span className="font-bold text-gray-800">リピート・来院:</span>{' '}
              対象来院{qualifyingCount}回 / リピート{repeatVisitCount}回 / 初診日{firstQDate ? new Date(firstQDate).toLocaleDateString('ja-JP') : '—'} / 初診当日物販{firstDayProductCount}件
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-700 underline decoration-blue-200">全履歴タイムライン</h3>
                <p className="text-xs text-slate-500 mt-1">
                  来院{visits.length}件 / 実通院最大{visitOrdinalById.size}回 / 物販{products.length}件 / サブスク{subs.length}件
                </p>
              </div>
              <p className="text-xs text-slate-500">来院行から修正・削除できます</p>
            </div>
            <div className="border-2 border-gray-100 rounded-xl overflow-auto max-h-[34rem] bg-gray-50/30">
              {timeline.length === 0 ? (
                <div className="p-8 text-center text-gray-400">履歴がありません</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {timeline.map((row) => {
                    const v = row.visitRecord;
                    const pm = v ? formatPaymentMethodLabel(v.payment_method, paymentMethodNames) : null;
                    const pd = v ? formatPaymentDetailLabel(v.payment_detail_id, paymentDetailNames, v.import_kind_text, v.memo) : null;
                    const typeClass =
                      row.kind === 'visit'
                        ? 'bg-blue-100 text-blue-700'
                        : row.kind === 'product'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-purple-100 text-purple-700';
                    return (
                      <li key={row.id} className="min-w-[78rem] px-2 py-1.5 hover:bg-white transition-colors">
                        <div className="grid grid-cols-[5.8rem_3.8rem_7rem_minmax(12rem,1.2fr)_6.5rem_8rem_6rem_minmax(9rem,0.75fr)_5rem_4.5rem_5.8rem] items-center gap-1.5 text-sm">
                          <div className="font-bold text-gray-800 whitespace-nowrap">
                            {new Date(row.date).toLocaleDateString('ja-JP')}
                          </div>

                          <div>
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${typeClass}`}>{row.label}</span>
                          </div>

                          <div className="whitespace-nowrap text-[11px] font-bold text-blue-700">
                            {v ? `${row.isFirstVisit ? '初回 / ' : ''}実通院${row.visitOrdinal || 0}回` : '—'}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-bold text-gray-800">
                              {v ? visitTimelineMenuLabel(v, paymentDetailNames) : row.sublabel}
                            </div>
                          </div>

                          <div className="min-w-0 truncate text-xs text-gray-700" title={pm || ''}>
                            {pm && pm !== '-' ? pm : '—'}
                          </div>

                          <div className="min-w-0 truncate text-xs text-gray-700" title={pd || ''}>
                            {pd && pd !== '-' ? pd : '—'}
                          </div>

                          <div className="font-bold text-gray-900 whitespace-nowrap">
                            ¥{Math.round(row.amount).toLocaleString()}
                          </div>

                          <div
                            className="min-w-0 truncate text-xs text-gray-600"
                            title={[v?.import_ticket_count_raw, v?.memo].filter(Boolean).join(' / ')}
                          >
                            {v?.import_ticket_count_raw
                              ? `回数券: ${compactMemo(v.import_ticket_count_raw)}`
                              : v?.memo
                                ? `メモ: ${compactMemo(v.memo)}`
                                : '—'}
                          </div>

                          <div className="min-w-0 truncate text-xs text-gray-700" title={v?.staff_name || ''}>
                            {v?.staff_name || '—'}
                          </div>

                          <div className="min-w-0 truncate text-xs text-gray-700" title={v?.clinic_name || ''}>
                            {v?.clinic_name ? clinicNameToShortLabel(v.clinic_name) : '—'}
                          </div>

                          <div className="flex justify-end gap-1">
                            {v ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openVisitEdit(v)}
                                  className="px-2 py-1 text-xs font-bold rounded border border-blue-300 text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                                >
                                  修正
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteVisit(v)}
                                  className="px-2 py-1 text-xs font-bold rounded border border-red-300 text-red-700 hover:bg-red-50 whitespace-nowrap"
                                >
                                  削除
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3 pt-6 border-t border-gray-100">
            {/* 維持費用 */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryOpen((p) => (p === 'maintenance' ? null : 'maintenance'))}
                className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-amber-100/60 transition-colors min-h-[4.5rem]"
              >
                <div>
                  <div className="text-[10px] font-bold text-amber-600">維持費用 合計（タップで内訳）</div>
                  <div className="text-2xl font-bold text-amber-900">¥{Math.round(maintenanceSummary).toLocaleString()}</div>
                </div>
                {summaryOpen === 'maintenance' ? (
                  <ChevronDown className="shrink-0 text-amber-800 mt-1" size={22} />
                ) : (
                  <ChevronRight className="shrink-0 text-amber-800 mt-1" size={22} />
                )}
              </button>
              {summaryOpen === 'maintenance' && (
                <div className="border-t border-amber-200 bg-white/90 px-3 py-2 max-h-80 overflow-y-auto text-xs text-amber-950">
                  {visitsWithMaintenance.length === 0 ? (
                    <p className="text-amber-800/90 py-2">維持費が記録された来院（0円以外）はありません。</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {visitsWithMaintenance.map((v) => {
                        const pd = formatPaymentDetailLabel(
                          v.payment_detail_id,
                          paymentDetailNames,
                          v.import_kind_text,
                          v.memo
                        );
                        const pm = formatPaymentMethodLabel(v.payment_method, paymentMethodNames);
                        return (
                          <li key={v.id} className="border-b border-amber-100 pb-2 last:border-0 last:pb-0">
                            <div className="font-bold text-amber-900">{formatDateJaYmd(v.visit_date)} 来院</div>
                            <div className="mt-1 space-y-0.5 text-[11px] text-amber-950/95">
                              <div>
                                維持費: ¥{Math.round(Number(v.maintenance_cost || 0)).toLocaleString()}{' '}
                                <span className="text-amber-700/90">
                                  ／ 施術売上: ¥{Math.round(Number(v.amount || 0)).toLocaleString()}
                                </span>
                              </div>
                              {visitTimelineMenuLabel(v, paymentDetailNames) !== '—' && (
                                <div>メニュー: {visitTimelineMenuLabel(v, paymentDetailNames)}</div>
                              )}
                              <div>支払: {pm !== '-' ? pm : '—'}</div>
                              {pd !== '-' && <div>種類: {pd}</div>}
                              {v.clinic_name && (
                                <div>院: {clinicNameToShortLabel(v.clinic_name)}</div>
                              )}
                              {v.staff_name && <div>担当: {v.staff_name}</div>}
                              {v.memo && (v.memo || '').trim() !== '' && (
                                <div className="whitespace-pre-wrap break-words text-amber-900/85">メモ: {v.memo}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* 物販 */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryOpen((p) => (p === 'product' ? null : 'product'))}
                className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-orange-100/60 transition-colors min-h-[4.5rem]"
              >
                <div>
                  <div className="text-[10px] font-bold text-orange-600">物販集計（タップで内訳）</div>
                  <div className="text-xl font-bold text-orange-900 mt-0.5">
                    ¥{Math.round(productSummary.amountTotal).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-orange-800 mt-1">
                    {productSummary.qtyTotal}個 / {productSummary.lineCount}件
                  </div>
                </div>
                {summaryOpen === 'product' ? (
                  <ChevronDown className="shrink-0 text-orange-800 mt-1" size={22} />
                ) : (
                  <ChevronRight className="shrink-0 text-orange-800 mt-1" size={22} />
                )}
              </button>
              {summaryOpen === 'product' && (
                <div className="border-t border-orange-200 bg-white/90 px-3 py-2 max-h-80 overflow-y-auto text-xs text-orange-950">
                  {products.length === 0 ? (
                    <p className="text-orange-800/90 py-2">物販の登録はありません。</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {products.map((p) => {
                        const pm = formatPaymentMethodLabel(p.payment_method, paymentMethodNames);
                        return (
                          <li key={p.id} className="border-b border-orange-100 pb-2 last:border-0 last:pb-0">
                            <div className="font-bold text-orange-900">{formatDateJaYmd(p.sale_date)}</div>
                            <div className="mt-1 space-y-0.5 text-[11px] text-orange-950/95">
                              <div>
                                {p.product_name || '商品名未登録'} ×{p.quantity ?? 0} ＝{' '}
                                <span className="font-bold">¥{Math.round(Number(p.amount || 0)).toLocaleString()}</span>
                              </div>
                              <div>支払: {pm !== '-' ? pm : '—'}</div>
                              {p.clinic_name && <div>院: {clinicNameToShortLabel(p.clinic_name)}</div>}
                              {p.staff_name && <div>担当: {p.staff_name}</div>}
                              {p.memo && (p.memo || '').trim() !== '' && (
                                <div className="whitespace-pre-wrap break-words text-orange-900/85">メモ: {p.memo}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* サブスク */}
            <div className="rounded-xl border border-purple-200 bg-purple-50 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryOpen((p) => (p === 'subscription' ? null : 'subscription'))}
                className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-purple-100/60 transition-colors min-h-[4.5rem]"
              >
                <div>
                  <div className="text-[10px] font-bold text-purple-600">サブスク集計（タップで内訳）</div>
                  <div className="text-xl font-bold text-purple-900 mt-0.5">
                    ¥{Math.round(subscriptionSummary.amountTotal).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-purple-800 mt-1">{subscriptionSummary.count}件</div>
                </div>
                {summaryOpen === 'subscription' ? (
                  <ChevronDown className="shrink-0 text-purple-800 mt-1" size={22} />
                ) : (
                  <ChevronRight className="shrink-0 text-purple-800 mt-1" size={22} />
                )}
              </button>
              {summaryOpen === 'subscription' && (
                <div className="border-t border-purple-200 bg-white/90 px-3 py-2 max-h-80 overflow-y-auto text-xs text-purple-950">
                  {subs.length === 0 ? (
                    <p className="text-purple-800/90 py-2">サブスクの登録はありません。</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {subs.map((s) => {
                        const pm = formatPaymentMethodLabel(s.payment_method, paymentMethodNames);
                        return (
                          <li key={s.id} className="border-b border-purple-100 pb-2 last:border-0 last:pb-0">
                            <div className="font-bold text-purple-900">開始 {formatDateJaYmd(s.start_date)}</div>
                            <div className="mt-1 space-y-0.5 text-[11px] text-purple-950/95">
                              <div>
                                {s.subscription_name || 'プラン名未登録'}{' '}
                                <span className="font-bold">¥{Math.round(Number(s.amount || 0)).toLocaleString()}</span>
                              </div>
                              <div>支払: {pm !== '-' ? pm : '—'}</div>
                              {s.clinic_name && <div>院: {clinicNameToShortLabel(s.clinic_name)}</div>}
                              {s.staff_name && <div>担当: {s.staff_name}</div>}
                              {s.memo && (s.memo || '').trim() !== '' && (
                                <div className="whitespace-pre-wrap break-words text-purple-900/85">メモ: {s.memo}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <ImageIcon size={18} className="text-blue-500" />
              来院画像一覧（日付順）
            </h3>
            {allMediaEntries.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                画像はまだありません
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3">
                {allMediaEntries.map((m) => (
                  <div key={`${m.visitId}-${m.url}`} className="group rounded-xl border bg-white p-2 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setPreviewMedia(m)}
                      className="block w-full overflow-hidden rounded-lg bg-slate-100 aspect-square"
                      title="拡大表示"
                    >
                      <img
                        src={m.url}
                        alt="visit-media"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </button>
                    <div className="mt-1 truncate text-center text-[11px] font-bold text-gray-700">
                      {formatDateJaYmd(m.visitDate)}
                    </div>
                    <div className="mt-1 flex justify-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => downloadMedia(m.url)}
                        className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        DL
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMediaUrl(m.visitId, m.url)}
                        className="px-1.5 py-0.5 text-[10px] font-bold rounded border border-red-200 text-red-700 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {previewMedia && (
        <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4">
          <div className="relative max-w-5xl w-full">
            <div className="mb-2 flex items-center justify-between text-white">
              <div className="text-sm font-bold">{formatDateJaYmd(previewMedia.visitDate)}</div>
              <ModalCloseButton onClick={() => setPreviewMedia(null)} variant="onDark" />
            </div>
            <img
              src={previewMedia.url}
              alt="visit-media-preview"
              className="max-h-[82vh] w-full object-contain rounded-xl bg-black shadow-2xl"
            />
          </div>
        </div>
      )}

      {editingVisit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-xl p-4 space-y-3"
            {...visitEditFormInputProps}
          >
            <h4 className="text-base font-bold text-gray-800">来院履歴を修正</h4>
            <p className="text-xs text-slate-500">来院入力の修正と同じ項目を保存します（種類・メニュー・回数券表記など）</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">来院日</label>
                <input
                  type="date"
                  value={editVisitDate}
                  onChange={(e) => setEditVisitDate(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">院</label>
                <select
                  value={editVisitClinic}
                  onChange={(e) => setEditVisitClinic(e.target.value as ClinicFullName)}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                >
                  {CLINIC_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">金額</label>
              <input
                type="number"
                value={editVisitAmount}
                onChange={(e) => setEditVisitAmount(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">担当スタッフ</label>
              <select
                value={editVisitStaffId}
                onChange={(e) => setEditVisitStaffId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">未設定</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">支払方法</label>
              <select
                value={editVisitPaymentMethod}
                onChange={(e) => setEditVisitPaymentMethod(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">未設定</option>
                {paymentMethodOptions.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>
            {editVisitKindLegacy && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                取込データの種類: <strong>{editVisitKindLegacy}</strong>
                <span className="block mt-0.5">下の「種類」で選び直して保存するとマスタ名称になります</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">種類</label>
              <select
                value={editVisitPaymentDetailId}
                onChange={(e) => setEditVisitPaymentDetailId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">未設定</option>
                {paymentDetailOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">メニュー</label>
              <select
                value={editVisitMenuName}
                onChange={(e) => {
                  markVisitEditTouched();
                  const name = e.target.value;
                  setEditVisitMenuName(name);
                  const hit = menuOptions.find((m) => m.name === name);
                  setEditVisitMenuId(hit?.id ?? '');
                }}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">未選択</option>
                {editVisitMenuName &&
                  !menuOptions.some((m) => m.name === editVisitMenuName) && (
                    <option value={editVisitMenuName}>{editVisitMenuName}</option>
                  )}
                {menuOptions.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-0.5">
                マスタにない名称は一覧に出ます（1回の選択で反映されます）
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">回数券（表記）</label>
              <input
                type="text"
                value={editVisitTicketRaw}
                onChange={(e) => setEditVisitTicketRaw(e.target.value)}
                placeholder="例: 8/24"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-0.5">CSVの回数券列。メモ欄とは別です</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">メモ</label>
              <JapaneseTextarea
                value={editVisitMemo}
                onChange={(e) => setEditVisitMemo(e.target.value)}
                rows={3}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => guardNavigation(() => setEditingVisit(null))}
                className="px-3 py-1.5 text-sm font-bold rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={savingVisitEdit}
                onClick={() => void saveVisitEdit()}
                className="px-3 py-1.5 text-sm font-bold rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {savingVisitEdit ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomerRosterEditModal
        customer={selectedCustomer}
        open={customerInfoEditOpen && selectedCustomer !== null}
        onClose={() => setCustomerInfoEditOpen(false)}
        onSaved={() => void handleCustomerInfoSaved()}
      />
    </div>
  );
}