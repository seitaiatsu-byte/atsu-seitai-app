import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, TrendingUp, Repeat, Megaphone, Clock3, Activity, Grid3X3, Map as MapIcon, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clinicMatchesRecord } from '../lib/clinic';
import { bucketStoredPaymentMethod, formatPaymentDetailLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import { parseLocalVisitDateToYmd } from '../lib/visitDateParse';

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

function normalizeYm(ym: string): string {
  const s = String(ym || '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  return toYm(new Date());
}

function classifySalesType(label: string): 'transfer' | 'single' | 'coupon' | 'subscription' | 'product' {
  const s = label.replace(/\s+/g, '').toLowerCase();
  if (!s) return 'single';
  if (s.includes('振込') || s.includes('bank') || s.includes('transfer')) return 'transfer';
  if (s.includes('回数券') || s.includes('回数') || s.includes('チケット')) return 'coupon';
  if (s.includes('サブスク') || s.includes('定期') || s.includes('subscription')) return 'subscription';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

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
        let matchedVisits = 0;
        let matchedProducts = 0;
        let matchedSubs = 0;

        for (const v of visits) {
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
          const kind = classifySalesType(mixedLabel);

          if (kind === 'transfer') {
            // 振込は集計表の現金側「振込」に統一
            row.cashTransfer += amount;
          } else if (methodBucket === 'cash') {
            if (kind === 'transfer') row.cashTransfer += amount;
            else if (kind === 'coupon') row.cashCoupon += amount;
            else if (kind === 'subscription') row.cashSubscription += amount;
            else if (kind === 'product') row.cashProduct += amount;
            else row.cashSingle += amount;
          } else {
            if (kind === 'coupon') row.cardCoupon += amount;
            else if (kind === 'subscription') row.cardSubscription += amount;
            else if (kind === 'product') row.cardProduct += amount;
            else row.cardSingle += amount;
          }
          row.dayTotal += amount;
        }

        for (const p of products) {
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
        }

        for (const s of subs) {
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
        }

        setRows(baseRows);
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

          <div className="overflow-x-auto border-2 border-green-200 rounded-xl">
            <table className="w-full table-fixed text-xs md:text-sm">
              <thead>
                <tr className="bg-green-200 text-gray-800">
                  <th rowSpan={2} className="border px-1 py-2 w-[140px]">日付</th>
                  <th colSpan={6} className="border px-1 py-2">現金</th>
                  <th colSpan={5} className="border px-1 py-2">クレジットカード（squareベース）、現金以外</th>
                  <th rowSpan={2} className="border px-1 py-2 bg-amber-50">日計</th>
                </tr>
                <tr className="bg-green-50 text-gray-700">
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
                    <tr key={r.date} className="odd:bg-[#f5fff5] even:bg-white">
                      <td className={`border px-1 py-1 font-mono whitespace-nowrap ${dateTextClass}`}>{formatDateWithWeekday(r.date)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cashTransfer)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cashSingle)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cashCoupon)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cashSubscription)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cashProduct)}</td>
                      <td className="border px-1 py-1 text-right font-bold">{yen(cashTotal)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cardSingle)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cardCoupon)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cardSubscription)}</td>
                      <td className="border px-1 py-1 text-right">{yen(r.cardProduct)}</td>
                      <td className="border px-1 py-1 text-right font-bold">{yen(cardTotal)}</td>
                      <td className="border px-1 py-1 text-right font-bold bg-amber-50 text-blue-700">{yen(r.dayTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#eef4ff] font-bold">
                  <td className="border px-1 py-2">合計</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashTransfer)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashSingle)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashCoupon)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashSubscription)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashProduct)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cashTransfer + totals.cashSingle + totals.cashCoupon + totals.cashSubscription + totals.cashProduct)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardSingle)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardCoupon)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardSubscription)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardProduct)}</td>
                  <td className="border px-1 py-2 text-right">{yen(totals.cardSingle + totals.cardCoupon + totals.cardSubscription + totals.cardProduct)}</td>
                  <td className="border px-1 py-2 text-right bg-amber-100 text-blue-700">{yen(totals.dayTotal)}</td>
                </tr>
                <tr className="bg-[#f7fbff] font-bold text-blue-900">
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
          <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-5">
            <div className="text-sm text-blue-800 font-bold mb-1">{activeMeta.title}</div>
            <div className="text-sm text-blue-700">
              この画面はプレースホルダーです。次のステップで「{activeMeta.title}」の詳細分析コンテンツを実装できます。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
