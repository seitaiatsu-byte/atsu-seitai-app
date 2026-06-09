import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, TrendingUp, Repeat, Megaphone, Clock3, Activity, Grid3X3, Map as MapIcon, DollarSign } from 'lucide-react';
import ModalCloseButton from './ModalCloseButton';
import { supabase } from '../lib/supabase';
import { clinicMatchesRecord } from '../lib/clinic';
import { bucketStoredPaymentMethod, formatPaymentDetailLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import { parseLocalVisitDateToYmd } from '../lib/visitDateParse';
import { fetchBusinessRules } from '../lib/businessRules';
import { repeatRateSecond, repeatRateSixth, type CustomerForRepeat } from '../lib/repeatMetrics';
import { fetchAllCustomersByCreatedDesc } from '../lib/fetchAllCustomers';
import { isRealCustomerNumber, placeholderCustomerIds } from '../lib/customerNumber';
import RepeatAnalysis from './RepeatAnalysis';
import UtilizationAnalysis from './UtilizationAnalysis';
import { fetchUtilizationSchedule } from '../lib/clinicWeeklySchedule';
import { computeUtilizationForPeriod } from '../lib/utilizationMetrics';

type ClinicFilter = 'kawanishi' | 'takatsuki' | 'all';
type PageTab = 'sales' | 'analysis';

type Row = {
  date: string;
  cashTransfer: number;
  cashSingle: number;
  cashCoupon: number;
  cashSubscription: number;
  cashProduct: number;
  cardSingle: number;
  cardCoupon: number;
  cardSubscription: number;
  cardProduct: number;
  dayTotal: number;
};

type AnalysisItem = { key: string; title: string; subtitle: string; icon: typeof BarChart3 };
type LapsedCustomerLite = { id: string; name: string; days: number };
type DailyBreakdownItem = {
  id: string;
  sourceType: '来院' | '物販' | 'サブスク';
  customerId: string;
  customerNumber: string;
  customerName: string;
  amount: number;
};

const ANALYSIS_ITEMS: AnalysisItem[] = [
  { key: 'sales', title: '売上集計', subtitle: '日別・月別・年別の売上分析', icon: DollarSign },
  { key: 'slips', title: '伝票一覧', subtitle: '施術伝票の一覧と詳細', icon: FileText },
  { key: 'ltv', title: 'LTV分析', subtitle: '顧客生涯価値の分析', icon: TrendingUp },
  { key: 'repeat', title: 'リピート分析', subtitle: '新規・リピート比率の推移', icon: Repeat },
  { key: 'new-vs-existing', title: '新規/既存分析', subtitle: '新規・既存患者の比率推移', icon: Activity },
  { key: 'roas', title: 'ROAS分析', subtitle: '広告費用対効果の分析', icon: Megaphone },
  { key: 'unit-time', title: '時間単価', subtitle: '時間あたりの売上効率', icon: Clock3 },
  { key: 'utilization', title: '稼働率', subtitle: '予約枠の稼働状況', icon: BarChart3 },
  { key: 'cross', title: 'クロス集計', subtitle: '多角的な売上LTV分析', icon: Grid3X3 },
  { key: 'area', title: 'エリア分析', subtitle: 'エリア別LTV分析・地域カテゴリ', icon: MapIcon },
];

const yen = (v: number) => `${Math.round(v).toLocaleString()}`;
const pad2 = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toYm = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const JP_WEEK = ['日', '月', '火', '水', '木', '金', '土'] as const;
const CSV_HEADER = [
  '日付',
  '現金_振込',
  '現金_都度払い',
  '現金_回数券',
  '現金_サブスク',
  '現金_物販売上',
  '現金_計',
  'クレジットカード等_都度払い',
  'クレジットカード等_回数券',
  'クレジットカード等_サブスク',
  'クレジットカード等_物販売上',
  'クレジットカード等_計',
  '日計',
] as const;

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function normalizeText(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

function daysBetween(fromYmd: string, to: Date): number {
  const from = new Date(`${fromYmd}T00:00:00`);
  if (Number.isNaN(from.getTime())) return 999999;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function parseDurationRules(raw: string): { keyword: string; minutes: number }[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      const keyword = line.slice(0, idx).trim();
      const minutes = parseInt(line.slice(idx + 1).trim(), 10);
      if (!keyword || !Number.isFinite(minutes) || minutes <= 0) return null;
      return { keyword: keyword.toLowerCase(), minutes };
    })
    .filter((x): x is { keyword: string; minutes: number } => Boolean(x));
}

function normalizeYm(ym: string): string {
  const s = String(ym || '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  return toYm(new Date());
}

/** 来院記録の内訳分類（サブスク列には載せない。サブスク売上は subscription_records のみ） */
function classifyVisitSalesType(label: string): 'transfer' | 'single' | 'coupon' | 'product' {
  const s = label.replace(/\s+/g, '').toLowerCase();
  if (!s) return 'single';
  if (s.includes('振込') || s.includes('bank') || s.includes('transfer')) return 'transfer';
  if (s.includes('回数券') || s.includes('回数') || s.includes('チケット')) return 'coupon';
  if (s.includes('物販') || s.includes('商品') || s.includes('プロテイン')) return 'product';
  return 'single';
}

function formatDateWithWeekday(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}/${m}/${day}(${JP_WEEK[d.getDay()]})`;
}

/** スマホ用（年は表の上に表示） */
function formatDateCompact(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}（${JP_WEEK[d.getDay()]}）`;
}

function salesYearFromMonth(ym: string): string {
  const y = parseInt(normalizeYm(ym).split('-')[0] || '', 10);
  return Number.isFinite(y) ? `${y}年` : '';
}

const SALES_AMT_CELL = 'border px-1 py-1 text-right hidden md:table-cell';
const SALES_DAY_TOTAL_CELL =
  'border px-1 py-1 text-right font-bold bg-amber-50 text-blue-700 tabular-nums max-md:px-0.5 max-md:text-[11px]';

function weekdayKind(ymd: string): 'sun' | 'sat' | 'weekday' {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'weekday';
  const w = d.getDay();
  if (w === 0) return 'sun';
  if (w === 6) return 'sat';
  return 'weekday';
}

/** DB の日付が ISO / スラッシュ / 日付+時刻 どれでも YYYY-MM-DD に寄せる */
function coerceRecordDayYmd(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    return parseLocalVisitDateToYmd(head);
  }
  return parseLocalVisitDateToYmd(s);
}

function coerceAmount(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const n = parseFloat(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function buildRowsForMonth(ym: string): Row[] {
  const [y, m] = normalizeYm(ym).split('-').map((x) => parseInt(x, 10));
  const monthStart = new Date(y, (m || 1) - 1, 1);
  const monthEnd = new Date(y, (m || 1), 0);
  const out: Row[] = [];
  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    out.push({
      date: toYmd(d),
      cashTransfer: 0,
      cashSingle: 0,
      cashCoupon: 0,
      cashSubscription: 0,
      cashProduct: 0,
      cardSingle: 0,
      cardCoupon: 0,
      cardSubscription: 0,
      cardProduct: 0,
      dayTotal: 0,
    });
  }
  return out;
}

export default function SalesAggregationDashboard() {
  const [tab, setTab] = useState<PageTab>('sales');
  const [clinicFilter, setClinicFilter] = useState<ClinicFilter>('all');
  const [month, setMonth] = useState<string>(toYm(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<string>('sales');
  const [reloadTick, setReloadTick] = useState(0);
  const [sourceCount, setSourceCount] = useState({ visits: 0, products: 0, subs: 0 });
  const [rawFetched, setRawFetched] = useState({ visits: 0, products: 0, subs: 0 });
  const [breakdownByDate, setBreakdownByDate] = useState<Record<string, DailyBreakdownItem[]>>({});
  const [selectedBreakdownDate, setSelectedBreakdownDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeMemberCount, setActiveMemberCount] = useState(0);
  const [lapsedRiskCount, setLapsedRiskCount] = useState(0);
  const [churnCount, setChurnCount] = useState(0);
  const [lapsedRiskList, setLapsedRiskList] = useState<LapsedCustomerLite[]>([]);
  const [repeat2Rate, setRepeat2Rate] = useState(0);
  const [repeat6Rate, setRepeat6Rate] = useState(0);
  const [utilizationRate, setUtilizationRate] = useState(0);
  const [actualSlotsUsed, setActualSlotsUsed] = useState(0);
  const [maxSlotsTotal, setMaxSlotsTotal] = useState(0);
  const [yenPerMinute, setYenPerMinute] = useState(0);
  const [cpa, setCpa] = useState(0);
  const [roas, setRoas] = useState(0);
  const [adSpend, setAdSpend] = useState(0);
  const [adNewCustomers, setAdNewCustomers] = useState(0);
  const [adRevenue, setAdRevenue] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const ym = normalizeYm(month);
        if (ym !== month) setMonth(ym);
        const baseRows = buildRowsForMonth(ym);
        const indexByDate = new Map(baseRows.map((r, idx) => [r.date, idx]));
        const monthPrefix = `${ym}-`;

        const MAX_ROWS = 80000;
        const [visRes, prodRes, subRes, methodsRes, detailsRes] = await Promise.all([
          supabase.from('visit_records').select('*').order('created_at', { ascending: false }).limit(MAX_ROWS),
          supabase.from('product_sales').select('*').order('created_at', { ascending: false }).limit(MAX_ROWS),
          supabase.from('subscription_records').select('*').order('created_at', { ascending: false }).limit(MAX_ROWS),
          supabase.from('payment_method_master').select('id,name'),
          supabase.from('payment_detail_master').select('id,name'),
        ]);

        const visits = (visRes.data as Record<string, unknown>[] | null) || [];
        const products = (prodRes.data as Record<string, unknown>[] | null) || [];
        const subs = (subRes.data as Record<string, unknown>[] | null) || [];
        const customers = await fetchAllCustomersByCreatedDesc();
        const methods = methodsRes.data;
        const details = detailsRes.data;

        const errMsg = [
          visRes.error?.message,
          prodRes.error?.message,
          subRes.error?.message,
          methodsRes.error?.message,
          detailsRes.error?.message,
        ]
          .filter(Boolean)
          .join(' | ');
        if (errMsg) setLoadError(errMsg);
        setTruncated(visits.length >= MAX_ROWS || products.length >= MAX_ROWS || subs.length >= MAX_ROWS);
        setRawFetched({ visits: visits.length, products: products.length, subs: subs.length });

        const detailMap = mergeIdNameMaps(methods as { id: string; name: string }[], details as { id: string; name: string }[]);
        const skipIds = placeholderCustomerIds(customers);
        const customerInfoMap = new Map<string, { customerNumber: string; customerName: string }>();
        customers.forEach((c) => {
          if (skipIds.has(String(c.id))) return;
          customerInfoMap.set(String(c.id), {
            customerNumber: String(c.customer_number ?? ''),
            customerName: String(c.name ?? ''),
          });
        });
        const dayBreakdown = new Map<string, DailyBreakdownItem[]>();
        const pushBreakdown = (day: string, item: DailyBreakdownItem) => {
          const list = dayBreakdown.get(day) || [];
          list.push(item);
          dayBreakdown.set(day, list);
        };
        let matchedVisits = 0;
        let matchedProducts = 0;
        let matchedSubs = 0;

        for (const v of visits) {
          if (skipIds.has(String(v.customer_id))) continue;
          if (!clinicMatchesRecord(clinicFilter, v.clinic_name)) continue;
          const day = coerceRecordDayYmd(v.visit_date);
          if (!day || !day.startsWith(monthPrefix)) continue;
          matchedVisits += 1;
          const idx = indexByDate.get(day);
          if (idx == null) continue;
          const row = baseRows[idx];
          const amount = coerceAmount(v.amount);
          if (amount === 0) continue;

          const methodBucket = bucketStoredPaymentMethod(v.payment_method, detailMap);
          const detailLabel = formatPaymentDetailLabel(
            (v.payment_detail_id as string | null | undefined) ?? null,
            detailMap,
            (v.import_kind_text as string | null | undefined) ?? null,
            (v.memo as string | null | undefined) ?? null
          );
          const paymentLabel = String(v.payment_method ?? '');
          const mixedLabel = `${detailLabel} ${paymentLabel} ${v.menu_name ?? ''} ${v.memo ?? ''} ${v.import_kind_text ?? ''}`;
          const kind = classifyVisitSalesType(mixedLabel);

          if (kind === 'transfer') {
            // 振込は集計表の現金側「振込」に統一
            row.cashTransfer += amount;
          } else if (methodBucket === 'cash') {
            if (kind === 'transfer') row.cashTransfer += amount;
            else if (kind === 'coupon') row.cashCoupon += amount;
            else if (kind === 'product') row.cashProduct += amount;
            else row.cashSingle += amount;
          } else {
            if (kind === 'coupon') row.cardCoupon += amount;
            else if (kind === 'product') row.cardProduct += amount;
            else row.cardSingle += amount;
          }
          row.dayTotal += amount;
          const cid = String(v.customer_id ?? '');
          const c = customerInfoMap.get(cid);
          const legacyName = String(v.import_customer_name ?? '').trim();
          pushBreakdown(day, {
            id: `visit-${String(v.id ?? `${cid}-${day}-${amount}`)}`,
            sourceType: '来院',
            customerId: cid,
            customerNumber: c?.customerNumber || '',
            customerName: c?.customerName || legacyName || '（顧客名未設定）',
            amount,
          });
        }

        for (const p of products) {
          if (skipIds.has(String(p.customer_id))) continue;
          if (!clinicMatchesRecord(clinicFilter, p.clinic_name)) continue;
          const day = coerceRecordDayYmd(p.sale_date);
          if (!day || !day.startsWith(monthPrefix)) continue;
          matchedProducts += 1;
          const idx = indexByDate.get(day);
          if (idx == null) continue;
          const row = baseRows[idx];
          const amount = coerceAmount(p.amount);
          if (amount === 0) continue;
          const methodBucket = bucketStoredPaymentMethod(p.payment_method, detailMap);
          if (methodBucket === 'cash') row.cashProduct += amount;
          else row.cardProduct += amount;
          row.dayTotal += amount;
          const cid = String(p.customer_id ?? '');
          const c = customerInfoMap.get(cid);
          pushBreakdown(day, {
            id: `product-${String(p.id ?? `${cid}-${day}-${amount}`)}`,
            sourceType: '物販',
            customerId: cid,
            customerNumber: c?.customerNumber || '',
            customerName: c?.customerName || '（顧客名未設定）',
            amount,
          });
        }

        for (const s of subs) {
          if (skipIds.has(String(s.customer_id))) continue;
          if (!clinicMatchesRecord(clinicFilter, s.clinic_name)) continue;
          const day = coerceRecordDayYmd(s.start_date);
          if (!day || !day.startsWith(monthPrefix)) continue;
          matchedSubs += 1;
          const idx = indexByDate.get(day);
          if (idx == null) continue;
          const row = baseRows[idx];
          const amount = coerceAmount(s.amount);
          if (amount === 0) continue;
          const methodBucket = bucketStoredPaymentMethod(s.payment_method, detailMap);
          if (methodBucket === 'cash') row.cashSubscription += amount;
          else row.cardSubscription += amount;
          row.dayTotal += amount;
          const cid = String(s.customer_id ?? '');
          const c = customerInfoMap.get(cid);
          pushBreakdown(day, {
            id: `sub-${String(s.id ?? `${cid}-${day}-${amount}`)}`,
            sourceType: 'サブスク',
            customerId: cid,
            customerNumber: c?.customerNumber || '',
            customerName: c?.customerName || '（顧客名未設定）',
            amount,
          });
        }

        setRows(baseRows);
        const breakdownObj: Record<string, DailyBreakdownItem[]> = {};
        dayBreakdown.forEach((list, day) => {
          breakdownObj[day] = [...list].sort((a, b) => b.amount - a.amount);
        });
        setBreakdownByDate(breakdownObj);
        setSourceCount({
          visits: matchedVisits,
          products: matchedProducts,
          subs: matchedSubs,
        });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [month, clinicFilter, reloadTick]);

  useEffect(() => {
    const loadAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const [rules, utilSchedule] = await Promise.all([fetchBusinessRules(), fetchUtilizationSchedule()]);
        const ym = normalizeYm(month);
        const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
        const monthStart = `${y}-${pad2(m)}-01`;
        const monthEnd = `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
        const mustExcludeKeywords = Array.from(new Set([...rules.excludeKeywords, '初']));
        const adKeywords = rules.adSourceKeywords.map((x) => x.toLowerCase());
        const durationRules = parseDurationRules(rules.menuDurationRules);

        const [customersRes, visitsRes, productRes, subsRes] = await Promise.all([
          supabase.from('customers').select('id,name,clinic_name,referral_source,main_source,created_at'),
          supabase.from('visit_records').select('customer_id,visit_date,menu_name,amount,clinic_name'),
          supabase.from('product_sales').select('customer_id,sale_date,amount,clinic_name'),
          supabase.from('subscription_records').select('customer_id,start_date,amount,clinic_name'),
        ]);
        const err = [customersRes.error?.message, visitsRes.error?.message, productRes.error?.message, subsRes.error?.message]
          .filter(Boolean)
          .join(' | ');
        if (err) throw new Error(err);

        const customers = (customersRes.data as Record<string, unknown>[] | null) || [];
        const visits = ((visitsRes.data as Record<string, unknown>[] | null) || []).filter((v) =>
          clinicMatchesRecord(clinicFilter, v.clinic_name)
        );
        const products = ((productRes.data as Record<string, unknown>[] | null) || []).filter((p) =>
          clinicMatchesRecord(clinicFilter, p.clinic_name)
        );
        const subs = ((subsRes.data as Record<string, unknown>[] | null) || []).filter((s) => clinicMatchesRecord(clinicFilter, s.clinic_name));

        const customerMap = new Map<string, Record<string, unknown>>();
        for (const c of customers) {
          if (!isRealCustomerNumber(String(c.customer_number ?? ''))) continue;
          if (!clinicMatchesRecord(clinicFilter, c.clinic_name)) continue;
          customerMap.set(String(c.id), c);
        }
        const customerIds = new Set(customerMap.keys());

        const visitsInScope = visits.filter((v) => customerIds.has(String(v.customer_id)));
        const productsInScope = products.filter((v) => customerIds.has(String(v.customer_id)));
        const subsInScope = subs.filter((v) => customerIds.has(String(v.customer_id)));

        const byCustomerVisit = new Map<string, { visit_date: string; menu_name?: string | null }[]>();
        const latestVisitYmd = new Map<string, string>();
        for (const v of visitsInScope) {
          const cid = String(v.customer_id);
          const day = coerceRecordDayYmd(v.visit_date);
          if (!day) continue;
          if (!byCustomerVisit.has(cid)) byCustomerVisit.set(cid, []);
          byCustomerVisit.get(cid)!.push({ visit_date: day, menu_name: String(v.menu_name ?? '') });
          const prev = latestVisitYmd.get(cid);
          if (!prev || day > prev) latestVisitYmd.set(cid, day);
        }

        const today = new Date();
        let active = 0;
        let risk = 0;
        let churn = 0;
        const riskList: LapsedCustomerLite[] = [];
        for (const [cid, cust] of customerMap.entries()) {
          const last = latestVisitYmd.get(cid);
          if (!last) continue;
          const d = daysBetween(last, today);
          if (d < rules.inactiveDaysThreshold) active++;
          if (d >= rules.inactiveDaysThreshold) {
            risk++;
            riskList.push({ id: cid, name: String(cust.name ?? '不明'), days: d });
          }
          if (d >= rules.churnLapsedDays) churn++;
        }
        riskList.sort((a, b) => b.days - a.days);
        setActiveMemberCount(active);
        setLapsedRiskCount(risk);
        setChurnCount(churn);
        setLapsedRiskList(riskList.slice(0, 20));

        const repeatCustomers: CustomerForRepeat[] = [];
        byCustomerVisit.forEach((list, id) => repeatCustomers.push({ id, visits: list }));
        setRepeat2Rate(repeatRateSecond(repeatCustomers, mustExcludeKeywords));
        setRepeat6Rate(repeatRateSixth(repeatCustomers, mustExcludeKeywords));

        const monthVisits = visitsInScope.filter((v) => {
          const day = coerceRecordDayYmd(v.visit_date);
          return !!day && day >= monthStart && day <= monthEnd;
        });
        const monthUtil = computeUtilizationForPeriod({
          visits: monthVisits.map((v) => ({
            visit_date: coerceRecordDayYmd(v.visit_date) || '',
            menu_name: String(v.menu_name ?? ''),
            clinic_name: String(v.clinic_name ?? ''),
          })),
          excludeKeywords: mustExcludeKeywords,
          schedule: utilSchedule,
          clinicFilter,
          startYmd: monthStart,
          endYmd: monthEnd,
          label: ym,
        });
        setActualSlotsUsed(monthUtil.slotsUsed);
        setMaxSlotsTotal(monthUtil.maxSlots);
        setUtilizationRate(monthUtil.utilizationRate);

        let minuteRevenue = 0;
        let minuteTotal = 0;
        for (const v of monthVisits) {
          const menuLabel = normalizeText(v.menu_name);
          const amount = coerceAmount(v.amount);
          if (amount <= 0) continue;
          let minutes = rules.defaultTreatmentMinutes;
          const hit = durationRules.find((r) => menuLabel.includes(r.keyword));
          if (hit) minutes = hit.minutes;
          minuteRevenue += amount;
          minuteTotal += Math.max(1, minutes);
        }
        setYenPerMinute(minuteTotal > 0 ? Math.round((minuteRevenue / minuteTotal) * 10) / 10 : 0);

        const adCustomerIds = new Set<string>();
        for (const [cid, c] of customerMap.entries()) {
          const src = `${normalizeText(c.referral_source)} ${normalizeText(c.main_source)}`;
          if (adKeywords.some((kw) => kw && src.includes(kw))) adCustomerIds.add(cid);
        }
        const adMonthNew = [...adCustomerIds].filter((cid) => {
          const c = customerMap.get(cid);
          const created = coerceRecordDayYmd(c?.created_at);
          return !!created && created >= monthStart && created <= monthEnd;
        }).length;
        let adMonthRevenue = 0;
        for (const v of monthVisits) if (adCustomerIds.has(String(v.customer_id))) adMonthRevenue += coerceAmount(v.amount);
        for (const p of productsInScope) {
          const day = coerceRecordDayYmd(p.sale_date);
          if (day && day >= monthStart && day <= monthEnd && adCustomerIds.has(String(p.customer_id))) adMonthRevenue += coerceAmount(p.amount);
        }
        for (const s of subsInScope) {
          const day = coerceRecordDayYmd(s.start_date);
          if (day && day >= monthStart && day <= monthEnd && adCustomerIds.has(String(s.customer_id))) adMonthRevenue += coerceAmount(s.amount);
        }

        const spend = Math.max(0, rules.monthlyAdSpend);
        setAdSpend(spend);
        setAdNewCustomers(adMonthNew);
        setAdRevenue(Math.round(adMonthRevenue));
        setCpa(adMonthNew > 0 ? Math.round(spend / adMonthNew) : 0);
        setRoas(spend > 0 ? Math.round((adMonthRevenue / spend) * 1000) / 10 : 0);
      } catch (e) {
        setAnalysisError(e instanceof Error ? e.message : String(e));
      } finally {
        setAnalysisLoading(false);
      }
    };
    void loadAnalysis();
  }, [month, clinicFilter, reloadTick]);

  useEffect(() => {
    const reload = () => {
      setReloadTick((n) => n + 1);
    };
    window.addEventListener('records-updated', reload);
    return () => window.removeEventListener('records-updated', reload);
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.cashTransfer += r.cashTransfer;
        acc.cashSingle += r.cashSingle;
        acc.cashCoupon += r.cashCoupon;
        acc.cashSubscription += r.cashSubscription;
        acc.cashProduct += r.cashProduct;
        acc.cardSingle += r.cardSingle;
        acc.cardCoupon += r.cardCoupon;
        acc.cardSubscription += r.cardSubscription;
        acc.cardProduct += r.cardProduct;
        acc.dayTotal += r.dayTotal;
        return acc;
      },
      {
        cashTransfer: 0,
        cashSingle: 0,
        cashCoupon: 0,
        cashSubscription: 0,
        cashProduct: 0,
        cardSingle: 0,
        cardCoupon: 0,
        cardSubscription: 0,
        cardProduct: 0,
        dayTotal: 0,
      }
    );
  }, [rows]);

  const activeMeta = ANALYSIS_ITEMS.find((x) => x.key === activeAnalysis) || ANALYSIS_ITEMS[0];
  const monthLabel = normalizeYm(month);
  const selectedBreakdownItems = useMemo(
    () => (selectedBreakdownDate ? breakdownByDate[selectedBreakdownDate] || [] : []),
    [breakdownByDate, selectedBreakdownDate]
  );
  const selectedBreakdownTotal = useMemo(
    () => selectedBreakdownItems.reduce((sum, item) => sum + item.amount, 0),
    [selectedBreakdownItems]
  );

  const downloadCsv = () => {
    const lines: string[] = [];
    lines.push(CSV_HEADER.join(','));

    for (const r of rows) {
      const cashTotal = r.cashTransfer + r.cashSingle + r.cashCoupon + r.cashSubscription + r.cashProduct;
      const cardTotal = r.cardSingle + r.cardCoupon + r.cardSubscription + r.cardProduct;
      const cols = [
        formatDateWithWeekday(r.date),
        Math.round(r.cashTransfer),
        Math.round(r.cashSingle),
        Math.round(r.cashCoupon),
        Math.round(r.cashSubscription),
        Math.round(r.cashProduct),
        Math.round(cashTotal),
        Math.round(r.cardSingle),
        Math.round(r.cardCoupon),
        Math.round(r.cardSubscription),
        Math.round(r.cardProduct),
        Math.round(cardTotal),
        Math.round(r.dayTotal),
      ];
      lines.push(cols.map(csvEscape).join(','));
    }

    const totalRow = [
      '合計',
      Math.round(totals.cashTransfer),
      Math.round(totals.cashSingle),
      Math.round(totals.cashCoupon),
      Math.round(totals.cashSubscription),
      Math.round(totals.cashProduct),
      Math.round(totals.cashTransfer + totals.cashSingle + totals.cashCoupon + totals.cashSubscription + totals.cashProduct),
      Math.round(totals.cardSingle),
      Math.round(totals.cardCoupon),
      Math.round(totals.cardSubscription),
      Math.round(totals.cardProduct),
      Math.round(totals.cardSingle + totals.cardCoupon + totals.cardSubscription + totals.cardProduct),
      Math.round(totals.dayTotal),
    ];
    lines.push(totalRow.map(csvEscape).join(','));

    const transferRow = [
      '振込',
      Math.round(totals.cashTransfer),
      '-',
      '-',
      '-',
      '-',
      Math.round(totals.cashTransfer),
      '-',
      '-',
      '-',
      '-',
      '-',
      Math.round(totals.cashTransfer),
    ];
    lines.push(transferRow.map(csvEscape).join(','));

    const csv = `\uFEFF${lines.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const clinicLabel = clinicFilter === 'kawanishi' ? 'kawanishi' : clinicFilter === 'takatsuki' ? 'takatsuki' : 'all';
    link.href = url;
    link.setAttribute('download', `sales_aggregation_${clinicLabel}_${monthLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('sales')}
            className={`px-4 py-2 rounded-lg font-bold ${tab === 'sales' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            売上集計
          </button>
          <button
            type="button"
            onClick={() => setTab('analysis')}
            className={`px-4 py-2 rounded-lg font-bold ${tab === 'analysis' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            分析メニュー
          </button>
        </div>
      </div>

      {tab === 'sales' ? (
        <div className="bg-white rounded-2xl shadow p-4 space-y-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-black text-gray-800">
              {clinicFilter === 'kawanishi' ? '川西あつ整体院' : clinicFilter === 'takatsuki' ? '高槻あつ整体院' : '全院'} 売上日別集計表
            </h3>
            <input type="month" value={normalizeYm(month)} onChange={(e) => setMonth(normalizeYm(e.target.value))} className="px-3 py-2 border rounded-lg" />
            <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value as ClinicFilter)} className="px-3 py-2 border rounded-lg">
              <option value="kawanishi">川西あつ整体院</option>
              <option value="takatsuki">高槻あつ整体院</option>
              <option value="all">全院</option>
            </select>
            {loading && <span className="text-sm text-gray-500">集計中...</span>}
            {!loading && (
              <span className="text-xs text-gray-600">
                月内集計件数: 来院 {sourceCount.visits} / 物販 {sourceCount.products} / サブスク {sourceCount.subs}
                <span className="text-gray-400 ml-2">
                  （DB取得: 来院 {rawFetched.visits} / 物販 {rawFetched.products} / サブスク {rawFetched.subs}）
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={downloadCsv}
              className="ml-auto px-3 py-2 rounded-lg border border-emerald-400 bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
            >
              CSVダウンロード
            </button>
          </div>

          {loadError && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-bold mb-1">データ取得エラー</div>
              <div className="break-all">{loadError}</div>
              <div className="text-xs mt-2 text-red-700">
                Supabase の RLS またはテーブル権限を確認してください。来院入力は見えても、この画面だけ拒否されている場合があります。
              </div>
            </div>
          )}
          {truncated && !loadError && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              取得件数が上限に達しました。古いデータが集計から漏れる可能性があります（要相談で上限を上げます）。
            </div>
          )}

          <p className="md:hidden text-lg font-black text-gray-900 -mb-1">{salesYearFromMonth(month)}</p>
          <p className="md:hidden text-[11px] text-gray-500 mb-1">日付と合計のみ（タップで内訳）</p>

          <div className="overflow-x-auto border-2 border-green-200 rounded-xl">
            <table className="w-full table-fixed text-xs md:text-sm">
              <thead>
                <tr className="md:hidden bg-green-200 text-gray-800">
                  <th className="border px-0.5 py-1 w-[4.25rem] text-left">日付</th>
                  <th className="border px-0.5 py-1 text-right bg-amber-50">合計</th>
                </tr>
                <tr className="hidden md:table-row bg-green-200 text-gray-800">
                  <th rowSpan={2} className="border px-1 py-2 w-[140px]">
                    日付
                  </th>
                  <th colSpan={6} className="border px-1 py-2">
                    現金
                  </th>
                  <th colSpan={5} className="border px-1 py-2">
                    クレジットカード（squareベース）、現金以外
                  </th>
                  <th rowSpan={2} className="border px-1 py-2 bg-amber-50">
                    日計
                  </th>
                </tr>
                <tr className="hidden md:table-row bg-green-50 text-gray-700">
                  <th className="border px-1 py-1">振込</th>
                  <th className="border px-1 py-1">都度払い</th>
                  <th className="border px-1 py-1">回数券</th>
                  <th className="border px-1 py-1">サブスク</th>
                  <th className="border px-1 py-1">物販売上</th>
                  <th className="border px-1 py-1">計</th>
                  <th className="border px-1 py-1">都度払い</th>
                  <th className="border px-1 py-1">回数券</th>
                  <th className="border px-1 py-1">サブスク</th>
                  <th className="border px-1 py-1">物販売上</th>
                  <th className="border px-1 py-1">計</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cashTotal = r.cashTransfer + r.cashSingle + r.cashCoupon + r.cashSubscription + r.cashProduct;
                  const cardTotal = r.cardSingle + r.cardCoupon + r.cardSubscription + r.cardProduct;
                  const wk = weekdayKind(r.date);
                  const dateTextClass = wk === 'sun' ? 'text-red-600' : wk === 'sat' ? 'text-blue-600' : 'text-gray-800';
                  return (
                    <tr
                      key={r.date}
                      className="odd:bg-[#f5fff5] even:bg-white cursor-pointer hover:bg-amber-50/40"
                      onClick={() => setSelectedBreakdownDate(r.date)}
                      title="タップでこの日の内訳を表示"
                    >
                      <td className={`border px-1 py-1 font-mono whitespace-nowrap max-md:px-0.5 max-md:text-[10px] ${dateTextClass}`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBreakdownDate(r.date);
                          }}
                          className="underline underline-offset-2 hover:text-blue-800 text-left max-md:leading-tight"
                          title="この日の内訳を表示"
                        >
                          <span className="md:hidden">{formatDateCompact(r.date)}</span>
                          <span className="hidden md:inline">{formatDateWithWeekday(r.date)}</span>
                        </button>
                      </td>
                      <td className={SALES_AMT_CELL}>{yen(r.cashTransfer)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cashSingle)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cashCoupon)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cashSubscription)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cashProduct)}</td>
                      <td className={`${SALES_AMT_CELL} font-bold`}>{yen(cashTotal)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cardSingle)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cardCoupon)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cardSubscription)}</td>
                      <td className={SALES_AMT_CELL}>{yen(r.cardProduct)}</td>
                      <td className={`${SALES_AMT_CELL} font-bold`}>{yen(cardTotal)}</td>
                      <td className={SALES_DAY_TOTAL_CELL}>
                        <button
                          type="button"
                          title="タップで日計の内訳を表示"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBreakdownDate(r.date);
                          }}
                          className="w-full text-right hover:text-blue-900 hover:bg-amber-100 rounded px-1 py-1 border border-transparent hover:border-blue-200 max-md:px-0"
                        >
                          <span className="underline underline-offset-2">{yen(r.dayTotal)}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="md:hidden bg-[#eef4ff] font-bold">
                  <td className="border px-0.5 py-1">合計</td>
                  <td className="border px-0.5 py-1 text-right bg-amber-100 text-blue-700 tabular-nums">{yen(totals.dayTotal)}</td>
                </tr>
                <tr className="hidden md:table-row bg-[#eef4ff] font-bold">
                  <td className="border px-1 py-2">合計</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashTransfer)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashSingle)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashCoupon)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashSubscription)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashProduct)}</td>
                  <td className="border px-1 py-2 text-right">
                    {yen(totals.cashTransfer + totals.cashSingle + totals.cashCoupon + totals.cashSubscription + totals.cashProduct)}
                  </td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardSingle)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardCoupon)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardSubscription)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardProduct)}</td>
                  <td className="border px-1 py-2 text-right">
                    {yen(totals.cardSingle + totals.cardCoupon + totals.cardSubscription + totals.cardProduct)}
                  </td>
                  <td className="border px-1 py-2 text-right bg-amber-100 text-blue-700">{yen(totals.dayTotal)}</td>
                </tr>
                <tr className="hidden md:table-row bg-[#f7fbff] font-bold text-blue-900">
                  <td className="border px-1 py-2">振込</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashTransfer)}</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashTransfer)}</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right">-</td>
                  <td className="border px-1 py-2 text-right bg-amber-50 text-blue-700">{yen(totals.cashTransfer)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow p-4 space-y-4">
          <h3 className="text-lg font-bold text-gray-800">分析ダッシュボード（メニュー）</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ANALYSIS_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeAnalysis === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveAnalysis(item.key)}
                  className={`text-left rounded-xl border-2 p-4 transition ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={active ? 'text-blue-600' : 'text-gray-500'} size={24} />
                    <div>
                      <div className="font-bold text-gray-900">{item.title}</div>
                      <div className="text-sm text-gray-600">{item.subtitle}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {activeAnalysis === 'sales' ? (
            <div className="space-y-4">
              {analysisError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{analysisError}</div>
              )}
              {analysisLoading ? (
                <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-500">分析データを集計中...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-emerald-500 text-white p-4">
                      <div className="text-xs">アクティブ会員数</div>
                      <div className="text-3xl font-black">{activeMemberCount}</div>
                    </div>
                    <div className="rounded-xl bg-amber-500 text-white p-4">
                      <div className="text-xs">離脱予備軍</div>
                      <div className="text-3xl font-black">{lapsedRiskCount}</div>
                    </div>
                    <div className="rounded-xl bg-rose-500 text-white p-4">
                      <div className="text-xs">離脱（設定日以上）</div>
                      <div className="text-3xl font-black">{churnCount}</div>
                    </div>
                    <div className="rounded-xl bg-sky-600 text-white p-4">
                      <div className="text-xs">稼働率</div>
                      <div className="text-3xl font-black">{utilizationRate}%</div>
                      <div className="text-[11px] opacity-90">
                        {actualSlotsUsed} / {maxSlotsTotal} 枠
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                      <div className="text-xs text-green-800 font-bold">2回目リピート率</div>
                      <div className="text-2xl font-black text-green-700">{repeat2Rate}%</div>
                    </div>
                    <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-4">
                      <div className="text-xs text-cyan-800 font-bold">6回目到達率</div>
                      <div className="text-2xl font-black text-cyan-700">{repeat6Rate}%</div>
                    </div>
                    <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4">
                      <div className="text-xs text-indigo-800 font-bold">分単価（平均）</div>
                      <div className="text-2xl font-black text-indigo-700">¥{yenPerMinute.toLocaleString()}/分</div>
                    </div>
                    <div className="rounded-xl bg-fuchsia-50 border border-fuchsia-200 p-4">
                      <div className="text-xs text-fuchsia-800 font-bold">ROAS / CPA</div>
                      <div className="text-sm font-bold text-fuchsia-700">ROAS {roas}%</div>
                      <div className="text-sm font-bold text-fuchsia-700">CPA ¥{Math.round(cpa).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="font-bold text-gray-800 mb-2">広告分析（{monthLabel}）</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <div className="rounded bg-gray-50 p-2">広告費: ¥{Math.round(adSpend).toLocaleString()}</div>
                      <div className="rounded bg-gray-50 p-2">広告経由新規: {adNewCustomers}人</div>
                      <div className="rounded bg-gray-50 p-2">広告経由売上: ¥{Math.round(adRevenue).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="font-bold text-gray-800 mb-2">離脱予備軍リスト（最終来院ベース）</div>
                    {lapsedRiskList.length === 0 ? (
                      <div className="text-sm text-gray-500">該当なし</div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1">
                        {lapsedRiskList.map((x) => (
                          <div key={x.id} className="flex justify-between text-sm border-b border-gray-100 py-1">
                            <span>{x.name}</span>
                            <span className="font-bold text-amber-700">{x.days}日</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : activeAnalysis === 'repeat' ? (
            <RepeatAnalysis />
          ) : activeAnalysis === 'utilization' ? (
            <UtilizationAnalysis />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-5">
              <div className="text-sm text-blue-800 font-bold mb-1">{activeMeta.title}</div>
              <div className="text-sm text-blue-700">
                この画面はプレースホルダーです。次のステップで「{activeMeta.title}」の詳細分析コンテンツを実装できます。
              </div>
            </div>
          )}
        </div>
      )}

      {selectedBreakdownDate && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">日計内訳</h3>
                <p className="text-sm text-gray-600">
                  {formatDateWithWeekday(selectedBreakdownDate)} / 合計 ¥{Math.round(selectedBreakdownTotal).toLocaleString()}
                </p>
              </div>
              <ModalCloseButton onClick={() => setSelectedBreakdownDate(null)} />
            </div>
            <div className="overflow-auto p-4">
              {selectedBreakdownItems.length === 0 ? (
                <div className="text-sm text-gray-500 py-8 text-center">この日の内訳データはありません。</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-3">区分</th>
                      <th className="py-2 pr-3">顧客番号</th>
                      <th className="py-2 pr-3">人物</th>
                      <th className="py-2 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBreakdownItems.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2 pr-3">{item.sourceType}</td>
                        <td className="py-2 pr-3 font-mono">{item.customerNumber || '—'}</td>
                        <td className="py-2 pr-3">{item.customerName}</td>
                        <td className="py-2 text-right font-bold">¥{Math.round(item.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
