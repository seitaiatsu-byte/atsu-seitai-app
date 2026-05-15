import { useState, useEffect } from 'react';
import { TrendingUp, User, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clinicMatchesRecord } from '../lib/clinic';
import { fetchAllCustomersByCreatedDesc } from '../lib/fetchAllCustomers';
import {
  findCustomerByRecordKey,
  hydrateCustomersByRecordKeys,
  legacyNameKeysForRecord,
  registerCustomerInMap,
} from '../lib/customerLookup';
import type { ClinicScope } from './ClinicScopeToggle';

interface CustomerLTV {
  customer_id: string;
  customer_name: string;
  customer_number?: string;
  total_ltv: number;
  visit_count: number;
  last_activity_date: string;
  phone_number?: string;
}

interface LTVRankingProps {
  clinicScope: ClinicScope;
}

interface MaintenanceRanking {
  customer_id: string;
  customer_name: string;
  customer_number?: string;
  total_cost: number;
}

interface ProductRanking {
  customer_id: string;
  customer_name: string;
  customer_number?: string;
  total_quantity: number;
  total_amount: number;
}

interface SubscriptionRanking {
  customer_id: string;
  customer_name: string;
  customer_number?: string;
  total_count: number;
  total_amount: number;
}

function resolveLegacyName(
  customerId: string,
  legacyNameByCustomerId: Map<string, string>,
  customerByKey: Map<string, Record<string, unknown>>
): string | undefined {
  for (const key of legacyNameKeysForRecord(customerId, customerByKey)) {
    const legacy = legacyNameByCustomerId.get(key);
    if (legacy) return legacy;
  }
  return undefined;
}

function resolveCustomerNameWithLookup(
  customerId: string,
  customerByKey: Map<string, Record<string, unknown>>,
  legacyNameByCustomerId: Map<string, string>
): string {
  const customer = findCustomerByRecordKey(customerId, customerByKey);
  const n = String(customer?.name ?? '').trim();
  if (n) return n;
  const k = String(customer?.name_kana ?? customer?.kana ?? '').trim();
  if (k) return k;
  const legacy = resolveLegacyName(customerId, legacyNameByCustomerId, customerByKey);
  if (legacy) return legacy;
  return '（氏名未取得）';
}

function pickCustomerNumber(customer: Record<string, unknown> | undefined): string | undefined {
  const v = String(customer?.customer_number ?? '').trim();
  return v || undefined;
}

function pickCustomerPhone(customer: Record<string, unknown> | undefined): string | undefined {
  const v = String(customer?.phone_number ?? customer?.tel ?? '').trim();
  return v || undefined;
}

export default function LTVRanking({ clinicScope }: LTVRankingProps) {
  const [rankings, setRankings] = useState<CustomerLTV[]>([]);
  const [maintenanceRankings, setMaintenanceRankings] = useState<MaintenanceRanking[]>([]);
  const [productRankings, setProductRankings] = useState<ProductRanking[]>([]);
  const [subscriptionRankings, setSubscriptionRankings] = useState<SubscriptionRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRankings();
    const onRecordsUpdated = () => loadRankings();
    window.addEventListener('records-updated', onRecordsUpdated);
    window.addEventListener('customers-updated', onRecordsUpdated);
    return () => {
      window.removeEventListener('records-updated', onRecordsUpdated);
      window.removeEventListener('customers-updated', onRecordsUpdated);
    };
  }, [clinicScope]);

  const loadRankings = async () => {
    setLoading(true);

    const { data: visits } = await supabase
      .from('visit_records')
      .select('customer_id, amount, visit_date, clinic_name, maintenance_cost, import_customer_name');
    const { data: products } = await supabase
      .from('product_sales')
      .select('customer_id, amount, quantity, sale_date, clinic_name');
    const { data: subscriptions } = await supabase
      .from('subscription_records')
      .select('customer_id, amount, start_date, clinic_name');

    const vRows = (visits || []).filter((x) => clinicMatchesRecord(clinicScope, x.clinic_name));
    const pRows = (products || []).filter((x) => clinicMatchesRecord(clinicScope, x.clinic_name));
    const sRows = (subscriptions || []).filter((x) => clinicMatchesRecord(clinicScope, x.clinic_name));

    const ids = new Set<string>();
    vRows.forEach((x) => ids.add(x.customer_id));
    pRows.forEach((x) => ids.add(x.customer_id));
    sRows.forEach((x) => ids.add(x.customer_id));

    const customerByKey = new Map<string, Record<string, unknown>>();
    try {
      const customers = await fetchAllCustomersByCreatedDesc();
      customers.forEach((c) => registerCustomerInMap(c, customerByKey));
      await hydrateCustomersByRecordKeys([...ids], customerByKey);
    } catch (e) {
      console.error('顧客名簿の取得に失敗:', e);
    }

    const customerMap = new Map<string, CustomerLTV>();
    const legacyNameByCustomerId = new Map<string, string>();
    vRows.forEach((v) => {
      const id = String(v.customer_id || '').trim();
      const legacyName = String(v.import_customer_name || '').trim();
      if (!id || !legacyName) return;
      for (const key of legacyNameKeysForRecord(id, customerByKey)) {
        if (!legacyNameByCustomerId.has(key)) legacyNameByCustomerId.set(key, legacyName);
      }
    });

    const bump = (customerId: string, amount: number, date: string, isVisit: boolean) => {
      const c = findCustomerByRecordKey(customerId, customerByKey);
      const existing = customerMap.get(customerId);
      if (existing) {
        existing.total_ltv += amount;
        if (isVisit) existing.visit_count += 1;
        if (date > existing.last_activity_date) existing.last_activity_date = date;
      } else {
        customerMap.set(customerId, {
          customer_id: customerId,
          customer_name: resolveCustomerNameWithLookup(customerId, customerByKey, legacyNameByCustomerId),
          customer_number: pickCustomerNumber(c),
          total_ltv: amount,
          visit_count: isVisit ? 1 : 0,
          last_activity_date: date,
          phone_number: pickCustomerPhone(c),
        });
      }
    };

    vRows.forEach((v) => bump(v.customer_id, Number(v.amount || 0), v.visit_date, true));
    pRows.forEach((p) => bump(p.customer_id, Number(p.amount || 0), p.sale_date, false));
    sRows.forEach((s) => bump(s.customer_id, Number(s.amount || 0), s.start_date, false));

    const sorted = Array.from(customerMap.values())
      .filter((r) => ids.has(r.customer_id))
      .sort((a, b) => b.total_ltv - a.total_ltv)
      .slice(0, 50);

    setRankings(sorted);

    const maintenanceMap = new Map<string, MaintenanceRanking>();
    vRows.forEach((v) => {
      const cost = Number(v.maintenance_cost || 0);
      if (cost <= 0) return;
      const customer = findCustomerByRecordKey(v.customer_id, customerByKey);
      const existing = maintenanceMap.get(v.customer_id);
      if (existing) existing.total_cost += cost;
      else {
        maintenanceMap.set(v.customer_id, {
          customer_id: v.customer_id,
          customer_name: resolveCustomerNameWithLookup(v.customer_id, customerByKey, legacyNameByCustomerId),
          customer_number: pickCustomerNumber(customer),
          total_cost: cost,
        });
      }
    });
    setMaintenanceRankings(
      Array.from(maintenanceMap.values())
        .sort((a, b) => b.total_cost - a.total_cost)
        .slice(0, 50)
    );

    const productMap = new Map<string, ProductRanking>();
    pRows.forEach((p) => {
      const amount = Number(p.amount || 0);
      const quantity = Number(p.quantity || 0);
      const customer = findCustomerByRecordKey(p.customer_id, customerByKey);
      const existing = productMap.get(p.customer_id);
      if (existing) {
        existing.total_amount += amount;
        existing.total_quantity += quantity;
      } else {
        productMap.set(p.customer_id, {
          customer_id: p.customer_id,
          customer_name: resolveCustomerNameWithLookup(p.customer_id, customerByKey, legacyNameByCustomerId),
          customer_number: pickCustomerNumber(customer),
          total_quantity: quantity,
          total_amount: amount,
        });
      }
    });
    setProductRankings(
      Array.from(productMap.values())
        .sort((a, b) => b.total_amount - a.total_amount)
        .slice(0, 50)
    );

    const subMap = new Map<string, SubscriptionRanking>();
    sRows.forEach((s) => {
      const amount = Number(s.amount || 0);
      const customer = findCustomerByRecordKey(s.customer_id, customerByKey);
      const existing = subMap.get(s.customer_id);
      if (existing) {
        existing.total_amount += amount;
        existing.total_count += 1;
      } else {
        subMap.set(s.customer_id, {
          customer_id: s.customer_id,
          customer_name: resolveCustomerNameWithLookup(s.customer_id, customerByKey, legacyNameByCustomerId),
          customer_number: pickCustomerNumber(customer),
          total_count: 1,
          total_amount: amount,
        });
      }
    });
    setSubscriptionRankings(
      Array.from(subMap.values())
        .sort((a, b) => b.total_amount - a.total_amount)
        .slice(0, 50)
    );

    setLoading(false);
  };

  const getDaysSinceLastVisit = (lastVisitDate: string) => {
    const last = new Date(lastVisitDate);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="text-yellow-600" size={32} />
          <h2 className="text-2xl font-bold text-gray-800">LTVランキング TOP50</h2>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">データがありません</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 p-3 bg-gray-100 rounded-lg font-bold text-sm text-gray-700">
              <div className="col-span-1 text-center">順位</div>
              <div className="col-span-3">顧客名</div>
              <div className="col-span-2">電話番号</div>
              <div className="col-span-2 text-right">累計売上</div>
              <div className="col-span-2 text-center">来院回数</div>
              <div className="col-span-2 text-center">最終活動</div>
            </div>

            {rankings.map((customer, index) => {
              const daysSince = getDaysSinceLastVisit(customer.last_activity_date);
              const isWarning = daysSince > 30;
              const isDanger = daysSince > 60;

              return (
                <div
                  key={customer.customer_id}
                  className={`grid grid-cols-12 gap-2 p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                    index < 3
                      ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="col-span-1 flex items-center justify-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                        index === 0
                          ? 'bg-yellow-400 text-white'
                          : index === 1
                            ? 'bg-gray-300 text-white'
                            : index === 2
                              ? 'bg-orange-400 text-white'
                              : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {index + 1}
                    </div>
                  </div>

                  <div className="col-span-3 flex items-center">
                    <div className="flex items-center gap-2">
                      <User size={18} className="text-gray-400" />
                      <div className="leading-tight">
                        <div className="font-bold text-gray-900">{customer.customer_name}</div>
                        <div className="text-xs text-gray-500">{customer.customer_number || '-'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center text-sm text-gray-600">{customer.phone_number || '-'}</div>

                  <div className="col-span-2 flex items-center justify-end">
                    <div className="flex items-center gap-1">
                      <DollarSign size={18} className="text-green-600" />
                      <span className="font-bold text-xl text-green-700">¥{Math.round(customer.total_ltv).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center justify-center">
                    <div className="bg-blue-100 px-4 py-2 rounded-full">
                      <span className="font-bold text-blue-800">{customer.visit_count}回</span>
                    </div>
                  </div>

                  <div className="col-span-2 flex items-center justify-center">
                    <div
                      className={`px-3 py-2 rounded-lg text-sm font-bold ${
                        isDanger ? 'bg-red-100 text-red-800' : isWarning ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        <span>{daysSince}日前</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <h3 className="text-lg font-bold text-amber-800 mb-3">維持費用ランキング</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {maintenanceRankings.map((r, i) => (
              <div key={r.customer_id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm font-bold text-gray-800">
                  {i + 1}. {r.customer_name}
                  <span className="text-xs text-gray-500 ml-1">({r.customer_number || '-'})</span>
                </span>
                <span className="text-sm font-bold text-amber-700">¥{Math.round(r.total_cost).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4">
          <h3 className="text-lg font-bold text-orange-800 mb-3">物販ランキング（数量・金額）</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {productRankings.map((r, i) => (
              <div key={r.customer_id} className="rounded-lg border px-3 py-2">
                <div className="text-sm font-bold text-gray-800">
                  {i + 1}. {r.customer_name}
                  <span className="text-xs text-gray-500 ml-1">({r.customer_number || '-'})</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">数量: {r.total_quantity}個</div>
                <div className="text-sm font-bold text-orange-700">¥{Math.round(r.total_amount).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4">
          <h3 className="text-lg font-bold text-purple-800 mb-3">サブスクランキング</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {subscriptionRankings.map((r, i) => (
              <div key={r.customer_id} className="rounded-lg border px-3 py-2">
                <div className="text-sm font-bold text-gray-800">
                  {i + 1}. {r.customer_name}
                  <span className="text-xs text-gray-500 ml-1">({r.customer_number || '-'})</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">件数: {r.total_count}件</div>
                <div className="text-sm font-bold text-purple-700">¥{Math.round(r.total_amount).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
