import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Download, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
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
  filterQualifyingVisits,
  firstQualifyingVisitDate,
  qualifyingVisitRepeatCount,
} from '../lib/repeatMetrics';
import { formatPaymentDetailLabel, formatPaymentMethodLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';
import { clinicNameToShortLabel } from '../lib/clinic';

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

export default function IndividualChart({ initialCustomer = null }: { initialCustomer?: Customer | null }) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [paymentMethodNames, setPaymentMethodNames] = useState<Record<string, string>>({});
  const [paymentDetailNames, setPaymentDetailNames] = useState<Record<string, string>>({});
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<{ id: string; name: string }[]>([]);
  const [menuOptions, setMenuOptions] = useState<MenuMaster[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
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
  const [editVisitDate, setEditVisitDate] = useState('');
  const [editVisitAmount, setEditVisitAmount] = useState('');
  const [editVisitMenu, setEditVisitMenu] = useState('');
  const [editVisitPaymentMethod, setEditVisitPaymentMethod] = useState('');
  const [editVisitMemo, setEditVisitMemo] = useState('');

  useEffect(() => {
    fetchBusinessRules().then((r) => setExcludeKeywords(r.excludeKeywords));
  }, []);

  useEffect(() => {
    if (initialCustomer) setSelectedCustomer(initialCustomer);
  }, [initialCustomer?.id]);

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
    const [{ data: v }, { data: p }, { data: s }, { data: pm }, { data: pd }, { data: menus }] = await Promise.all([
      supabase.from('visit_records').select('*').eq('customer_id', selectedCustomer.id).order('visit_date', { ascending: false }),
      supabase.from('product_sales').select('*').eq('customer_id', selectedCustomer.id).order('sale_date', { ascending: false }),
      supabase.from('subscription_records').select('*').eq('customer_id', selectedCustomer.id).order('start_date', { ascending: false }),
      supabase.from('payment_method_master').select('id, name'),
      supabase.from('payment_detail_master').select('id, name'),
      supabase.from('menu_master').select('*').eq('is_active', true).order('display_order'),
    ]);
    setVisits(v || []);
    setProducts(p || []);
    setSubs(s || []);
    const merged = mergeIdNameMaps(pm as { id: string; name: string }[], pd as { id: string; name: string }[]);
    setPaymentMethodNames(merged);
    setPaymentDetailNames(merged);
    setPaymentMethodOptions((pm || []) as { id: string; name: string }[]);
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

  useEffect(() => {
    void loadCustomerData();
  }, [loadCustomerData]);

  useEffect(() => {
    void loadActiveChartRows();
  }, [loadActiveChartRows]);

  useEffect(() => {
    setSummaryOpen(null);
  }, [selectedCustomer?.id]);

  useEffect(() => {
    const onRecordsUpdated = () => {
      void loadCustomerData();
      void loadActiveChartRows();
    };
    window.addEventListener('records-updated', onRecordsUpdated);
    return () => window.removeEventListener('records-updated', onRecordsUpdated);
  }, [loadCustomerData, loadActiveChartRows]);

  const totalLtv = useMemo(() => {
    const vt = visits.reduce((a, v) => a + Number(v.amount || 0), 0);
    const pt = products.reduce((a, p) => a + Number(p.amount || 0), 0);
    const st = subs.reduce((a, s) => a + Number(s.amount || 0), 0);
    return vt + pt + st;
  }, [visits, products, subs]);

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
    setEditingVisit(v);
    setEditVisitDate(String(v.visit_date || '').slice(0, 10));
    setEditVisitAmount(String(Number(v.amount || 0)));
    setEditVisitMenu(String(v.menu_name || ''));
    setEditVisitPaymentMethod(String(v.payment_method || ''));
    setEditVisitMemo(String(v.memo || ''));
  };

  const saveVisitEdit = async () => {
    if (!editingVisit) return;
    const amount = Number(editVisitAmount);
    if (!editVisitDate || !Number.isFinite(amount)) {
      alert('来院日と金額を正しく入力してください');
      return;
    }
    const menu = menuOptions.find((m) => m.name === editVisitMenu);
    const { error } = await supabase
      .from('visit_records')
      .update({
        visit_date: editVisitDate,
        amount,
        menu_id: menu?.id || null,
        menu_name: editVisitMenu || null,
        payment_method: editVisitPaymentMethod || null,
        memo: editVisitMemo || null,
      })
      .eq('id', editingVisit.id);
    if (error) {
      alert(`修正に失敗しました: ${error.message}`);
      return;
    }
    setEditingVisit(null);
    window.dispatchEvent(new Event('records-updated'));
    await loadCustomerData();
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
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">個人カルテ</h2>

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
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="text-left text-slate-700">
                      <th className="px-2 py-2 w-8"> </th>
                      <th className="px-2 py-2">
                        <button type="button" onClick={() => toggleActiveSort('number')} className="font-bold">番号/氏名 {sortMark('number')}</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" onClick={() => toggleActiveSort('age')} className="font-bold">年齢 {sortMark('age')}</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" onClick={() => toggleActiveSort('symptom')} className="font-bold">症状 {sortMark('symptom')}</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" onClick={() => toggleActiveSort('route')} className="font-bold">経路 {sortMark('route')}</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" onClick={() => toggleActiveSort('menu')} className="font-bold">メニュー {sortMark('menu')}</button>
                      </th>
                      <th className="px-2 py-2 text-right">
                        <button type="button" onClick={() => toggleActiveSort('ltv')} className="font-bold">LTV {sortMark('ltv')}</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" onClick={() => toggleActiveSort('latest')} className="font-bold">最新来院日 {sortMark('latest')}</button>
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
                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checkedActiveIds.has(r.customer.id)}
                            onChange={() => toggleActiveChecked(r.customer.id)}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-semibold">
                          <span className="mr-2">{r.customer.customer_number || '—'}</span>
                          <span className="text-slate-700">{r.customer.name || '—'}</span>
                        </td>
                        <td className="px-2 py-1.5">{getAgeYearsFromCustomer(r.customer) ?? '—'}歳</td>
                        <td className="px-2 py-1.5">{r.symptom}</td>
                        <td className="px-2 py-1.5">{r.route}</td>
                        <td className="px-2 py-1.5">{r.latestMenu}</td>
                        <td className="px-2 py-1.5 text-right font-bold text-blue-700">¥{Math.round(r.ltv).toLocaleString()}</td>
                        <td className={`px-2 py-1.5 ${latestVisitColorClass(r.daysSinceLatestVisit)}`}>
                          {r.latestVisitDate ? `${new Date(`${r.latestVisitDate}T12:00:00`).toLocaleDateString('ja-JP')}（${r.daysSinceLatestVisit}日経過）` : '来院なし'}
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
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl font-bold border bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X size={18} />
              別の顧客
            </button>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-3 mb-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs text-gray-600 font-bold">顧客番号</div>
                <div className="text-lg font-bold text-gray-900">{selectedCustomer.customer_number}</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5 leading-tight">
                  {selectedCustomer.name}
                  <span className="ml-2 text-sm font-normal text-gray-600">
                    {getKanaForRoster(selectedCustomer as CustomerRowRecord) ?? '—'}
                  </span>
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-bold text-pink-700">総LTV</div>
                <div className="text-2xl font-bold text-pink-900">¥{Math.round(totalLtv).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div><span className="font-bold text-gray-600">性別:</span> <span className="font-bold">{selectedCustomer.gender || '-'}</span></div>
              <div><span className="font-bold text-gray-600">年齢:</span> <span className="font-bold">{age != null ? `${age}歳` : '—'}</span></div>
              <div><span className="font-bold text-gray-600">生年月日:</span> <span className="font-bold">{birth ? new Date(birth).toLocaleDateString('ja-JP') : '-'}</span></div>
              <div><span className="font-bold text-gray-600">電話:</span> <span className="font-bold">{phoneForChart.value ?? '—'}</span></div>
              <div className="md:col-span-2"><span className="font-bold text-gray-600">住所:</span> <span className="font-bold">{[selectedCustomer.prefecture, selectedCustomer.city, selectedCustomer.town].filter(Boolean).join(' ') || '-'}</span></div>
              <div className="md:col-span-2"><span className="font-bold text-gray-600">流入経路:</span> <span className="font-bold">{inflowFromVisits.line ?? '—'}</span></div>
              <div className="md:col-span-2"><span className="font-bold text-gray-600">主訴:</span> <span className="font-bold">{formatTableCell(chiefLines[0], '—')} / {formatTableCell(chiefLines[1], '—')} / {formatTableCell(chiefLines[2], '—')}</span></div>
              <div><span className="font-bold text-gray-600">ポイント:</span> <span className="font-bold text-blue-600">{selectedCustomer.points ?? 0} pt</span></div>
              <div><span className="font-bold text-gray-600">院:</span> <span className="font-bold"><ClinicNameFromCustomer customer={selectedCustomer} emptyLabel="—" /></span></div>
            </div>

            {rosterMemo && (
              <div className="rounded-lg p-2.5 bg-white/90 border border-gray-200 text-sm">
                <div className="text-xs text-gray-600 font-bold mb-1">メモ</div>
                <div className="text-gray-800 whitespace-pre-wrap break-words">{rosterMemo}</div>
              </div>
            )}

            <div className="bg-white/80 rounded-lg p-2.5 border border-blue-200 text-xs text-gray-700">
              <span className="font-bold text-gray-800">リピート・来院（設定連動）:</span>{' '}
              対象来院 {qualifyingCount}回 / リピート {repeatVisitCount}回 / 初診日 {firstQDate ? new Date(firstQDate).toLocaleDateString('ja-JP') : '—'} / 初診当日物販 {firstDayProductCount}件
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
            <div className="border-2 border-gray-100 rounded-xl overflow-hidden max-h-[34rem] overflow-y-auto bg-gray-50/30">
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
                    const detailLine = v
                      ? [
                          pd && pd !== '-' ? pd : null,
                          pm && pm !== '-' ? pm : null,
                          v.staff_name ? `担:${v.staff_name}` : null,
                          v.clinic_name ? clinicNameToShortLabel(v.clinic_name) : null,
                          Number(v.maintenance_cost || 0) ? `維持¥${Math.round(Number(v.maintenance_cost || 0)).toLocaleString()}` : null,
                          Array.isArray(v.media_urls) && v.media_urls.length > 0 ? `画像${v.media_urls.length}` : null,
                        ]
                          .filter(Boolean)
                          .join(' / ')
                      : row.sublabel;
                    return (
                      <li key={row.id} className="px-2 py-1.5 hover:bg-white transition-colors">
                        <div className="grid grid-cols-1 md:grid-cols-[5.8rem_5.5rem_minmax(9rem,1.35fr)_minmax(7rem,0.9fr)_5.8rem_5.8rem] md:items-center gap-1.5 text-sm">
                          <div className="font-bold text-gray-800 md:whitespace-nowrap">
                            {new Date(row.date).toLocaleDateString('ja-JP')}
                          </div>

                          <div className="flex flex-wrap items-center gap-1 md:block">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${typeClass}`}>
                              {row.label}
                            </span>
                            {row.kind === 'visit' && (
                              <span className="ml-1 text-[11px] font-bold text-blue-700 md:ml-0 md:mt-0.5 md:block">
                                {row.isFirstVisit ? '初回 / ' : ''}実{row.visitOrdinal || 0}回
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-bold text-gray-800">
                              {v ? v.menu_name || '—' : row.sublabel}
                            </div>
                            <div className="truncate text-[11px] text-gray-500">{detailLine || '—'}</div>
                          </div>

                          <div className="min-w-0 truncate text-xs text-gray-600" title={v?.memo || ''}>
                            {v?.memo ? `メモ: ${v.memo}` : '—'}
                          </div>

                          <div className="font-bold text-gray-900 md:text-right md:whitespace-nowrap">
                            ¥{Math.round(row.amount).toLocaleString()}
                          </div>

                          <div className="flex gap-1 md:justify-end">
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

          {/* 来院画像一覧（あつさん指示：日付付きで上下に並べる） */}
          <div className="mt-8">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <ImageIcon size={18} className="text-blue-500" /> 
              来院画像一覧（日付順）
            </h3>
            {allMediaEntries.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
                画像はまだありません
              </div>
            ) : (
              <div className="flex flex-col gap-10">
                {allMediaEntries.map((m) => (
                  <div key={`${m.visitId}-${m.url}`} className="space-y-3">
                    {/* 日付ラベル */}
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-800 text-white px-4 py-1 rounded-full text-xs font-bold shadow-sm">
                        📅 {new Date(m.visitDate).toLocaleDateString('ja-JP')} 来院画像
                      </span>
                    </div>
                    
                    {/* 画像本体：大きく表示 */}
                    <div className="group relative rounded-2xl border-4 border-white shadow-xl bg-black overflow-hidden">
                      <img 
                        src={m.url} 
                        alt="visit-media" 
                        className="w-full h-auto block mx-auto hover:opacity-95 transition-opacity" 
                      />
                      
                      {/* 操作ボタン */}
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 p-2 rounded-xl backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => window.open(m.url, '_blank')}
                          className="p-2 text-white hover:bg-white/20 rounded-lg"
                          title="全画面"
                        >
                          <ImageIcon size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadMedia(m.url)}
                          className="p-2 text-blue-300 hover:bg-white/20 rounded-lg"
                          title="ダウンロード"
                        >
                          <Download size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMediaUrl(m.visitId, m.url)}
                          className="p-2 text-red-400 hover:bg-white/20 rounded-lg"
                          title="削除"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                              {v.menu_name && (
                                <div>メニュー: {v.menu_name}</div>
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
        </div>
      )}

      {editingVisit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-xl p-4 space-y-3">
            <h4 className="text-base font-bold text-gray-800">来院履歴を修正</h4>
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
              <label className="block text-xs font-bold text-gray-600 mb-1">金額</label>
              <input
                type="number"
                value={editVisitAmount}
                onChange={(e) => setEditVisitAmount(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">メニュー</label>
              <select
                value={editVisitMenu}
                onChange={(e) => setEditVisitMenu(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">未設定</option>
                {editVisitMenu && !menuOptions.some((m) => m.name === editVisitMenu) && (
                  <option value={editVisitMenu}>{editVisitMenu}</option>
                )}
                {menuOptions.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
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
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">メモ</label>
              <textarea
                value={editVisitMemo}
                onChange={(e) => setEditVisitMemo(e.target.value)}
                rows={3}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingVisit(null)}
                className="px-3 py-1.5 text-sm font-bold rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void saveVisitEdit()}
                className="px-3 py-1.5 text-sm font-bold rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}