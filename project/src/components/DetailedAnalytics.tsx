import { useState, useEffect } from 'react';
import { Activity, Users, PieChart as PieIcon, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clinicMatchesRecord, customerMatchesClinic } from '../lib/clinic';
import { fetchBusinessRules } from '../lib/businessRules';
import { repeatRateSecond, repeatRateSixth, type CustomerForRepeat } from '../lib/repeatMetrics';
import { getCustomerBirthDate, calculateAge } from '../lib/customerBirthday';
import type { ClinicScope } from './ClinicScopeToggle';

interface DetailedAnalyticsProps {
  clinicScope: ClinicScope;
}

function lastActivityDate(
  customerId: string,
  visits: { customer_id: string; visit_date: string }[],
  products: { customer_id: string; sale_date: string }[],
  subs: { customer_id: string; start_date: string }[]
): string | null {
  let max: string | null = null;
  visits.filter((v) => v.customer_id === customerId).forEach((v) => {
    if (!max || v.visit_date > max) max = v.visit_date;
  });
  products.filter((p) => p.customer_id === customerId).forEach((p) => {
    if (!max || p.sale_date > max) max = p.sale_date;
  });
  subs.filter((s) => s.customer_id === customerId).forEach((s) => {
    if (!max || s.start_date > max) max = s.start_date;
  });
  return max;
}

function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export default function DetailedAnalytics({ clinicScope }: DetailedAnalyticsProps) {
  const [repeat2, setRepeat2] = useState(0);
  const [repeat6, setRepeat6] = useState(0);
  const [churn6, setChurn6] = useState(0);
  const [churn12, setChurn12] = useState(0);
  const [ageBuckets, setAgeBuckets] = useState<Record<string, number>>({});
  const [genderRatio, setGenderRatio] = useState({ male: 0, female: 0, other: 0 });
  const [complaints, setComplaints] = useState<{ name: string; count: number }[]>([]);
  const [newByMonth, setNewByMonth] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    run();
    const onCustomersUpdated = () => run();
    const onRecordsUpdated = () => run();
    window.addEventListener('customers-updated', onCustomersUpdated);
    window.addEventListener('records-updated', onRecordsUpdated);
    return () => {
      window.removeEventListener('customers-updated', onCustomersUpdated);
      window.removeEventListener('records-updated', onRecordsUpdated);
    };
  }, [clinicScope]);

  const run = async () => {
    setLoading(true);
    const rules = await fetchBusinessRules();
    const lapse = rules.churnLapsedDays;

    const { data: customersRaw } = await supabase.from('customers').select('*');
    const customers = (customersRaw || []).filter((c) => customerMatchesClinic(clinicScope, c.clinic_name));

    const { data: visitsRaw } = await supabase
      .from('visit_records')
      .select('customer_id, visit_date, menu_name, clinic_name');
    const visits = (visitsRaw || []).filter((v) => clinicMatchesRecord(clinicScope, v.clinic_name));

    const { data: productsRaw } = await supabase.from('product_sales').select('customer_id, sale_date, clinic_name');
    const products = (productsRaw || []).filter((p) => clinicMatchesRecord(clinicScope, p.clinic_name));

    const { data: subsRaw } = await supabase.from('subscription_records').select('customer_id, start_date, clinic_name');
    const subs = (subsRaw || []).filter((s) => clinicMatchesRecord(clinicScope, s.clinic_name));

    const customerIds = new Set(customers.map((c) => c.id));
    const visitsInScope = visits.filter((v) => customerIds.has(v.customer_id));

    const byCustomer: CustomerForRepeat[] = [];
    const visitByCust = new Map<string, { visit_date: string; menu_name?: string | null }[]>();
    visitsInScope.forEach((v) => {
      if (!visitByCust.has(v.customer_id)) visitByCust.set(v.customer_id, []);
      visitByCust.get(v.customer_id)!.push({ visit_date: v.visit_date, menu_name: v.menu_name });
    });
    visitByCust.forEach((list, id) => {
      byCustomer.push({ id, visits: list });
    });

    setRepeat2(repeatRateSecond(byCustomer, rules.excludeKeywords));
    setRepeat6(repeatRateSixth(byCustomer, rules.excludeKeywords));

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const sixStart = addMonths(today, -6).toISOString().split('T')[0];
    const twelveStart = addMonths(today, -12).toISOString().split('T')[0];

    const hadActivityIn = (cid: string, from: string) => {
      if (visits.some((v) => v.customer_id === cid && v.visit_date >= from && v.visit_date <= todayStr)) return true;
      if (products.some((p) => p.customer_id === cid && p.sale_date >= from && p.sale_date <= todayStr)) return true;
      if (subs.some((s) => s.customer_id === cid && s.start_date >= from && s.start_date <= todayStr)) return true;
      return false;
    };

    const isChurned = (cid: string) => {
      const last = lastActivityDate(
        cid,
        visits.map((v) => ({ customer_id: v.customer_id, visit_date: v.visit_date })),
        products.map((p) => ({ customer_id: p.customer_id, sale_date: p.sale_date })),
        subs.map((s) => ({ customer_id: s.customer_id, start_date: s.start_date }))
      );
      if (!last) return true;
      const days = Math.floor((today.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24));
      return days >= lapse;
    };

    let c6 = 0,
      t6 = 0;
    customers.forEach((c) => {
      if (!hadActivityIn(c.id, sixStart)) return;
      t6++;
      if (isChurned(c.id)) c6++;
    });
    setChurn6(t6 === 0 ? 0 : Math.round((c6 / t6) * 1000) / 10);

    let c12 = 0,
      t12 = 0;
    customers.forEach((c) => {
      if (!hadActivityIn(c.id, twelveStart)) return;
      t12++;
      if (isChurned(c.id)) c12++;
    });
    setChurn12(t12 === 0 ? 0 : Math.round((c12 / t12) * 1000) / 10);

    const ages: Record<string, number> = { '〜20': 0, '21〜40': 0, '41〜60': 0, '61〜': 0, 不明: 0 };
    let male = 0,
      female = 0,
      other = 0;
    customers.forEach((c) => {
      const g = c.gender || '';
      if (g.includes('男') && !g.includes('女')) male++;
      else if (g.includes('女')) female++;
      else if (g) other++;
      const bd = getCustomerBirthDate(c);
      const a = calculateAge(bd);
      if (a == null) ages['不明']++;
      else if (a <= 20) ages['〜20']++;
      else if (a <= 40) ages['21〜40']++;
      else if (a <= 60) ages['41〜60']++;
      else ages['61〜']++;
    });
    setAgeBuckets(ages);
    const gsum = male + female + other || 1;
    setGenderRatio({
      male: Math.round((male / gsum) * 1000) / 10,
      female: Math.round((female / gsum) * 1000) / 10,
      other: Math.round((other / gsum) * 1000) / 10,
    });

    const compMap = new Map<string, number>();
    const addC = (x: string | null | undefined) => {
      if (!x?.trim()) return;
      compMap.set(x, (compMap.get(x) || 0) + 1);
    };
    customers.forEach((c) => {
      addC(c.chief_complaint_1);
      addC(c.chief_complaint_2);
      addC(c.chief_complaint_3);
      addC(c.chief_complaint);
    });
    setComplaints(
      [...compMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15)
    );

    const newMap = new Map<string, number>();
    customers.forEach((c) => {
      const m = c.created_at?.slice(0, 7);
      if (m) newMap.set(m, (newMap.get(m) || 0) + 1);
    });
    setNewByMonth(
      [...newMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-18)
        .map(([month, count]) => ({ month, count }))
    );

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center text-gray-500">
        詳細分析を読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-2">
        <Activity className="text-indigo-600" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">詳細分析（院別スコープ）</h2>
      </div>
      <p className="text-sm text-gray-600">
        離患率: 指定期間に活動があった顧客のうち、最終活動から離患判定日数（設定・既定90日）以上空いている割合。
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-emerald-500 text-white p-4 shadow">
          <div className="text-xs font-bold opacity-90">2回目リピート率</div>
          <div className="text-3xl font-bold">{repeat2}%</div>
        </div>
        <div className="rounded-xl bg-cyan-600 text-white p-4 shadow">
          <div className="text-xs font-bold opacity-90">6回目到達率</div>
          <div className="text-3xl font-bold">{repeat6}%</div>
        </div>
        <div className="rounded-xl bg-rose-500 text-white p-4 shadow">
          <div className="text-xs font-bold opacity-90">半年離患率</div>
          <div className="text-3xl font-bold">{churn6}%</div>
        </div>
        <div className="rounded-xl bg-red-700 text-white p-4 shadow">
          <div className="text-xs font-bold opacity-90">12ヶ月離患率</div>
          <div className="text-3xl font-bold">{churn12}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border-2 border-gray-200 rounded-xl p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Users size={18} />
            年齢層
          </h3>
          <ul className="space-y-2">
            {Object.entries(ageBuckets).map(([k, v]) => (
              <li key={k} className="flex justify-between text-sm">
                <span>{k}</span>
                <span className="font-bold">{v}人</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-2 border-gray-200 rounded-xl p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <PieIcon size={18} />
            男女比（登録ベース）
          </h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span>男性系</span>
              <span className="font-bold">{genderRatio.male}%</span>
            </li>
            <li className="flex justify-between">
              <span>女性</span>
              <span className="font-bold">{genderRatio.female}%</span>
            </li>
            <li className="flex justify-between">
              <span>その他・未設定</span>
              <span className="font-bold">{genderRatio.other}%</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-2 border-gray-200 rounded-xl p-4">
        <h3 className="font-bold text-gray-800 mb-3">主訴分布（主訴1〜3・列挙）</h3>
        {complaints.length === 0 ? (
          <p className="text-sm text-gray-500">データなし</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {complaints.map((c) => (
              <div key={c.name} className="flex justify-between text-sm border-b border-gray-100 pb-1">
                <span>{c.name}</span>
                <span className="font-bold">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-2 border-gray-200 rounded-xl p-4">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <UserPlus size={18} />
          新規登録数推移（created_at 月別）
        </h3>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {newByMonth.map((n) => (
            <span key={n.month} className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-900 text-sm font-bold">
              {n.month}: {n.count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
