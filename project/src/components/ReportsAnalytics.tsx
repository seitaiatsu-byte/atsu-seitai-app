import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Calendar, DollarSign, PieChart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clinicMatchesRecord } from '../lib/clinic';
import { formatPaymentDetailLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import type { ClinicScope } from './ClinicScopeToggle';

interface DailySales {
  date: string;
  visitTotal: number;
  productTotal: number;
  subscriptionTotal: number;
  total: number;
}

interface MonthlySales {
  month: string;
  visitTotal: number;
  productTotal: number;
  subscriptionTotal: number;
  total: number;
}

function aggregateTopSlices(
  entries: { label: string; value: number }[],
  topN: number
): { label: string; value: number }[] {
  const sorted = [...entries].filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, topN);
  const rest = sorted.slice(topN).reduce((s, e) => s + e.value, 0);
  if (rest > 0) head.push({ label: 'その他', value: rest });
  return head;
}

function MiniPieChart({
  title,
  slices,
  colors,
}: {
  title: string;
  slices: { label: string; value: number }[];
  colors: string[];
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
        <div className="font-bold text-gray-700 mb-1">{title}</div>
        データなし
      </div>
    );
  }

  const circumference = 2 * Math.PI * 70;
  let offset = 0;

  return (
    <div className="rounded-xl border-2 border-gray-200 p-4 bg-white">
      <div className="font-bold text-gray-800 text-center mb-2">{title}</div>
      <div className="relative w-44 h-44 mx-auto">
        <svg viewBox="0 0 160 160" className="transform -rotate-90">
          {slices.map((sl, i) => {
            const frac = sl.value / total;
            const dash = frac * circumference;
            const circle = (
              <circle
                key={sl.label + i}
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="24"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">¥{Math.round(total).toLocaleString()}</div>
            <div className="text-xs text-gray-500">計</div>
          </div>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-xs max-h-28 overflow-y-auto">
        {slices.map((sl, i) => (
          <li key={sl.label + i} className="flex justify-between gap-2">
            <span className="flex items-center gap-1 truncate">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="truncate">{sl.label}</span>
            </span>
            <span className="font-bold flex-shrink-0">
              {((sl.value / total) * 100).toFixed(1)}% / ¥{Math.round(sl.value).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ReportsAnalyticsProps {
  clinicScope: ClinicScope;
}

export default function ReportsAnalytics({ clinicScope }: ReportsAnalyticsProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [dailyData, setDailyData] = useState<DailySales[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlySales[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    visitTotal: 0,
    productTotal: 0,
    subscriptionTotal: 0,
    grandTotal: 0,
  });
  const [visitSlices, setVisitSlices] = useState<{ label: string; value: number }[]>([]);
  const [productSlices, setProductSlices] = useState<{ label: string; value: number }[]>([]);
  const [otherSlices, setOtherSlices] = useState<{ label: string; value: number }[]>([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 30000);
    const onCustomersUpdated = () => loadData();
    const onRecordsUpdated = () => loadData();
    window.addEventListener('customers-updated', onCustomersUpdated);
    window.addEventListener('records-updated', onRecordsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('customers-updated', onCustomersUpdated);
      window.removeEventListener('records-updated', onRecordsUpdated);
    };
  }, [viewMode, clinicScope]);

  const filterByClinic = <T extends { clinic_name?: string | null }>(rows: T[] | null) =>
    (rows || []).filter((r) => clinicMatchesRecord(clinicScope, r.clinic_name));

  const loadData = async () => {
    setLoading(true);

    const [{ data: rawVisits }, { data: rawProducts }, { data: rawSubs }, { data: mm }, { data: dm }] =
      await Promise.all([
        supabase.from('visit_records').select('*'),
        supabase.from('product_sales').select('*'),
        supabase.from('subscription_records').select('*'),
        supabase.from('payment_method_master').select('id,name'),
        supabase.from('payment_detail_master').select('id,name'),
      ]);

    const visits = filterByClinic(rawVisits);
    const products = filterByClinic(rawProducts);
    const subscriptions = filterByClinic(rawSubs);
    const detailMap = mergeIdNameMaps(mm as { id: string; name: string }[], dm as { id: string; name: string }[]);

    const visitBreakdownMap = new Map<string, number>();
    visits.forEach((v) => {
      const detailLabel = formatPaymentDetailLabel(v.payment_detail_id, detailMap, v.import_kind_text, v.memo);
      const label = detailLabel !== '-' ? detailLabel : '（未設定）';
      visitBreakdownMap.set(label, (visitBreakdownMap.get(label) || 0) + Number(v.amount || 0));
    });
    setVisitSlices(aggregateTopSlices([...visitBreakdownMap.entries()].map(([label, value]) => ({ label, value })), 5));

    const productBreakdownMap = new Map<string, number>();
    products.forEach((p) => {
      const label = p.product_name || '（未設定）';
      productBreakdownMap.set(label, (productBreakdownMap.get(label) || 0) + Number(p.amount || 0));
    });
    setProductSlices(
      aggregateTopSlices([...productBreakdownMap.entries()].map(([label, value]) => ({ label, value })), 5)
    );

    const subBreakdownMap = new Map<string, number>();
    subscriptions.forEach((s) => {
      const label = s.subscription_name || '（未設定）';
      subBreakdownMap.set(label, (subBreakdownMap.get(label) || 0) + Number(s.amount || 0));
    });
    setOtherSlices(
      aggregateTopSlices([...subBreakdownMap.entries()].map(([label, value]) => ({ label, value })), 5)
    );

    if (viewMode === 'daily') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];

      const v2 = visits.filter((v) => v.visit_date >= startDate);
      const p2 = products.filter((p) => p.sale_date >= startDate);
      const s2 = subscriptions.filter((s) => s.start_date >= startDate);

      const dailyMap: Record<string, { visitTotal: number; productTotal: number; subscriptionTotal: number }> = {};

      v2.forEach((v) => {
        if (!dailyMap[v.visit_date]) dailyMap[v.visit_date] = { visitTotal: 0, productTotal: 0, subscriptionTotal: 0 };
        dailyMap[v.visit_date].visitTotal += Number(v.amount || 0);
      });
      p2.forEach((p) => {
        if (!dailyMap[p.sale_date]) dailyMap[p.sale_date] = { visitTotal: 0, productTotal: 0, subscriptionTotal: 0 };
        dailyMap[p.sale_date].productTotal += Number(p.amount || 0);
      });
      s2.forEach((s) => {
        if (!dailyMap[s.start_date]) dailyMap[s.start_date] = { visitTotal: 0, productTotal: 0, subscriptionTotal: 0 };
        dailyMap[s.start_date].subscriptionTotal += Number(s.amount || 0);
      });

      const dailyArray: DailySales[] = Object.entries(dailyMap)
        .map(([date, totals]) => ({
          date,
          visitTotal: totals.visitTotal,
          productTotal: totals.productTotal,
          subscriptionTotal: totals.subscriptionTotal,
          total: totals.visitTotal + totals.productTotal + totals.subscriptionTotal,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setDailyData(dailyArray);
      const visitSum = dailyArray.reduce((sum, d) => sum + d.visitTotal, 0);
      const productSum = dailyArray.reduce((sum, d) => sum + d.productTotal, 0);
      const subscriptionSum = dailyArray.reduce((sum, d) => sum + d.subscriptionTotal, 0);
      setTotalStats({
        visitTotal: visitSum,
        productTotal: productSum,
        subscriptionTotal: subscriptionSum,
        grandTotal: visitSum + productSum + subscriptionSum,
      });
    } else {
      const monthlyMap: Record<string, { visitTotal: number; productTotal: number; subscriptionTotal: number }> = {};

      visits.forEach((v) => {
        const month = v.visit_date.substring(0, 7);
        if (!monthlyMap[month]) monthlyMap[month] = { visitTotal: 0, productTotal: 0, subscriptionTotal: 0 };
        monthlyMap[month].visitTotal += Number(v.amount || 0);
      });
      products.forEach((p) => {
        const month = p.sale_date.substring(0, 7);
        if (!monthlyMap[month]) monthlyMap[month] = { visitTotal: 0, productTotal: 0, subscriptionTotal: 0 };
        monthlyMap[month].productTotal += Number(p.amount || 0);
      });
      subscriptions.forEach((s) => {
        const month = s.start_date.substring(0, 7);
        if (!monthlyMap[month]) monthlyMap[month] = { visitTotal: 0, productTotal: 0, subscriptionTotal: 0 };
        monthlyMap[month].subscriptionTotal += Number(s.amount || 0);
      });

      const monthlyArray: MonthlySales[] = Object.entries(monthlyMap)
        .map(([month, totals]) => ({
          month,
          visitTotal: totals.visitTotal,
          productTotal: totals.productTotal,
          subscriptionTotal: totals.subscriptionTotal,
          total: totals.visitTotal + totals.productTotal + totals.subscriptionTotal,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      setMonthlyData(monthlyArray);
      const visitSum = monthlyArray.reduce((sum, m) => sum + m.visitTotal, 0);
      const productSum = monthlyArray.reduce((sum, m) => sum + m.productTotal, 0);
      const subscriptionSum = monthlyArray.reduce((sum, m) => sum + m.subscriptionTotal, 0);
      setTotalStats({
        visitTotal: visitSum,
        productTotal: productSum,
        subscriptionTotal: subscriptionSum,
        grandTotal: visitSum + productSum + subscriptionSum,
      });
    }

    setLoading(false);
  };

  const formatTrendYen = (n: number, compact: boolean) => {
    const v = Math.round(n);
    if (compact && v >= 10000) {
      const man = v / 10000;
      return `¥${Number.isInteger(man) ? man : man.toFixed(1)}万`;
    }
    if (compact && v >= 1000) return `¥${Math.round(v / 1000)}k`;
    return `¥${v.toLocaleString()}`;
  };

  const renderBarChart = () => {
    const data = viewMode === 'daily' ? dailyData : monthlyData;
    return (
      <div className="space-y-1 sm:space-y-1.5">
        {data.map((item) => {
          const date = viewMode === 'daily' ? (item as DailySales).date : (item as MonthlySales).month;
          const total = item.total;
          const dateLabel =
            viewMode === 'daily'
              ? new Date(date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
              : date;
          return (
            <div key={date} className="flex items-center gap-2 py-0.5">
              <span className="text-[11px] sm:text-sm font-bold text-gray-700 w-[4.2rem] sm:w-[5.5rem] shrink-0 tabular-nums">
                {dateLabel}
              </span>
              <div className="flex-1 min-w-0 h-1.5 sm:h-2 bg-gray-100 rounded-full overflow-hidden flex">
                {item.visitTotal > 0 && (
                  <div
                    className="bg-blue-500 h-full"
                    style={{ width: `${total ? (item.visitTotal / total) * 100 : 0}%` }}
                    title={`施術 ¥${item.visitTotal.toLocaleString()}`}
                  />
                )}
                {item.productTotal > 0 && (
                  <div
                    className="bg-orange-500 h-full"
                    style={{ width: `${total ? (item.productTotal / total) * 100 : 0}%` }}
                    title={`物販 ¥${item.productTotal.toLocaleString()}`}
                  />
                )}
                {item.subscriptionTotal > 0 && (
                  <div
                    className="bg-purple-500 h-full"
                    style={{ width: `${total ? (item.subscriptionTotal / total) * 100 : 0}%` }}
                    title={`他 ¥${item.subscriptionTotal.toLocaleString()}`}
                  />
                )}
              </div>
              <span className="text-[11px] sm:text-sm font-bold text-gray-900 shrink-0 tabular-nums text-right min-w-[3.5rem] sm:min-w-0">
                <span className="sm:hidden">{formatTrendYen(total, true)}</span>
                <span className="hidden sm:inline">¥{total.toLocaleString()}</span>
              </span>
            </div>
          );
        })}
        <p className="pt-1 text-[10px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
          <span><span className="inline-block w-2 h-1.5 rounded-sm bg-blue-500 align-middle mr-0.5" />施術</span>
          <span><span className="inline-block w-2 h-1.5 rounded-sm bg-orange-500 align-middle mr-0.5" />物販</span>
          <span><span className="inline-block w-2 h-1.5 rounded-sm bg-purple-500 align-middle mr-0.5" />他</span>
        </p>
      </div>
    );
  };

  const ratioPieSlices = () => {
    const t = totalStats.grandTotal;
    if (t <= 0) return [];
    return [
      { label: '施術', value: totalStats.visitTotal },
      { label: '物販', value: totalStats.productTotal },
      { label: '他（サブスク等）', value: totalStats.subscriptionTotal },
    ];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={28} />
          <h2 className="text-2xl font-bold text-gray-800">日報・月報</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-2 rounded-lg font-bold ${
              viewMode === 'daily' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700'
            }`}
          >
            <Calendar size={18} className="inline mr-1" />
            日報
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-2 rounded-lg font-bold ${
              viewMode === 'monthly' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700'
            }`}
          >
            <TrendingUp size={18} className="inline mr-1" />
            月報
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 max-sm:p-3 max-sm:rounded-xl">
        <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
          <BarChart3 size={20} />
          {viewMode === 'daily' ? '直近30日間の売上推移' : '月別売上推移'}
        </h3>
        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">{renderBarChart()}</div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 max-sm:p-3 max-sm:rounded-xl">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <PieChart size={20} />
          3種の円グラフ（施術内訳・物販内訳・他＝サブスク内訳）
        </h3>
        {loading ? (
          <div className="text-center py-8 text-gray-500">読み込み中...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniPieChart title="施術（プログラム別）" slices={visitSlices} colors={['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#1e40af', '#64748b']} />
            <MiniPieChart title="物販（商品別）" slices={productSlices} colors={['#ea580c', '#fb923c', '#fdba74', '#c2410c', '#9a3412', '#78716c']} />
            <MiniPieChart title="他（サブスク別）" slices={otherSlices} colors={['#a855f7', '#c084fc', '#e879f9', '#7e22ce', '#6b21a8', '#71717a']} />
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-2xl shadow-xl p-6 max-sm:p-4 max-sm:rounded-xl">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <DollarSign size={28} />
          <h3 className="text-base sm:text-xl font-bold">
            {viewMode === 'daily' ? '直近30日間の合計（院別スコープ適用）' : '全期間の合計（院別スコープ適用）'}
          </h3>
        </div>
        <div className="text-3xl sm:text-5xl font-bold mb-3 sm:mb-4">¥{totalStats.grandTotal.toLocaleString()}</div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-white bg-opacity-20 rounded-lg p-2 sm:p-3">
            <div className="text-xs sm:text-sm font-bold mb-1">施術</div>
            <div className="text-lg sm:text-2xl font-bold">¥{totalStats.visitTotal.toLocaleString()}</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-lg p-2 sm:p-3">
            <div className="text-xs sm:text-sm font-bold mb-1">物販</div>
            <div className="text-lg sm:text-2xl font-bold">¥{totalStats.productTotal.toLocaleString()}</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-lg p-2 sm:p-3">
            <div className="text-xs sm:text-sm font-bold mb-1">他</div>
            <div className="text-lg sm:text-2xl font-bold">¥{totalStats.subscriptionTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 max-sm:p-3 max-sm:rounded-xl">
        <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
          <PieChart size={20} />
          売上構成比（施術・物販・他）
        </h3>
        {loading || totalStats.grandTotal === 0 ? (
          <div className="text-center py-8 text-gray-500">データがありません</div>
        ) : (
          <MiniPieChart
            title="大分類"
            slices={ratioPieSlices()}
            colors={['#2563eb', '#ea580c', '#9333ea']}
          />
        )}
      </div>
    </div>
  );
}
