import { useState, useEffect } from 'react';
import { MapPin, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clinicMatchesRecord, customerMatchesClinic } from '../lib/clinic';
import type { ClinicScope } from './ClinicScopeToggle';

interface RegionData {
  region: string;
  customerCount: number;
  visitCount: number;
  totalRevenue: number;
}

interface RegionalAnalysisProps {
  clinicScope: ClinicScope;
}

export default function RegionalAnalysis({ clinicScope }: RegionalAnalysisProps) {
  const [prefectureData, setPrefectureData] = useState<RegionData[]>([]);
  const [cityData, setCityData] = useState<RegionData[]>([]);
  const [townData, setTownData] = useState<RegionData[]>([]);
  const [viewMode, setViewMode] = useState<'prefecture' | 'city' | 'town'>('city');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRegionalData();
  }, [clinicScope]);

  const loadRegionalData = async () => {
    setLoading(true);

    const { data: customersRaw } = await supabase.from('customers').select('id, prefecture, city, town, clinic_name');
    const customers = (customersRaw || []).filter((c: { clinic_name?: string | null }) =>
      customerMatchesClinic(clinicScope, c.clinic_name)
    );

    const { data: visitsRaw } = await supabase.from('visit_records').select('customer_id, amount, clinic_name');
    const visits = (visitsRaw || []).filter((v: { clinic_name?: string | null }) =>
      clinicMatchesRecord(clinicScope, v.clinic_name)
    );

    const customerMap = new Map<string, { prefecture: string; city: string; town: string }>();
    customers.forEach((c: { id: string; prefecture?: string | null; city?: string | null; town?: string | null }) => {
      customerMap.set(c.id, {
        prefecture: c.prefecture || '未設定',
        city: c.city || '未設定',
        town: c.town || '未設定',
      });
    });

    const prefectureStats = new Map<string, { count: number; visits: number; revenue: number }>();
    const cityStats = new Map<string, { count: number; visits: number; revenue: number }>();
    const townStats = new Map<string, { count: number; visits: number; revenue: number }>();

    customers.forEach((c: { prefecture?: string | null; city?: string | null; town?: string | null }) => {
      const pref = c.prefecture || '未設定';
      const city = c.city || '未設定';
      const town = c.town || '未設定';

      if (!prefectureStats.has(pref)) {
        prefectureStats.set(pref, { count: 0, visits: 0, revenue: 0 });
      }
      prefectureStats.get(pref)!.count++;

      if (!cityStats.has(city)) {
        cityStats.set(city, { count: 0, visits: 0, revenue: 0 });
      }
      cityStats.get(city)!.count++;

      if (!townStats.has(town)) {
        townStats.set(town, { count: 0, visits: 0, revenue: 0 });
      }
      townStats.get(town)!.count++;
    });

    {
      visits.forEach((v: { customer_id: string; amount?: number | null }) => {
        const customer = customerMap.get(v.customer_id);
        if (customer) {
          const prefStat = prefectureStats.get(customer.prefecture);
          if (prefStat) {
            prefStat.visits++;
            prefStat.revenue += v.amount || 0;
          }

          const cityStat = cityStats.get(customer.city);
          if (cityStat) {
            cityStat.visits++;
            cityStat.revenue += v.amount || 0;
          }

          const townStat = townStats.get(customer.town);
          if (townStat) {
            townStat.visits++;
            townStat.revenue += v.amount || 0;
          }
        }
      });
    }

    const prefData = Array.from(prefectureStats.entries())
      .map(([region, stats]) => ({
        region,
        customerCount: stats.count,
        visitCount: stats.visits,
        totalRevenue: stats.revenue,
      }))
      .sort((a, b) => b.customerCount - a.customerCount);

    const cityDataArr = Array.from(cityStats.entries())
      .map(([region, stats]) => ({
        region,
        customerCount: stats.count,
        visitCount: stats.visits,
        totalRevenue: stats.revenue,
      }))
      .sort((a, b) => b.customerCount - a.customerCount);

    const townDataArr = Array.from(townStats.entries())
      .map(([region, stats]) => ({
        region,
        customerCount: stats.count,
        visitCount: stats.visits,
        totalRevenue: stats.revenue,
      }))
      .sort((a, b) => b.customerCount - a.customerCount);

    setPrefectureData(prefData);
    setCityData(cityDataArr);
    setTownData(townDataArr);
    setLoading(false);
  };

  const getCurrentData = () => {
    switch (viewMode) {
      case 'prefecture':
        return prefectureData;
      case 'city':
        return cityData;
      case 'town':
        return townData;
      default:
        return cityData;
    }
  };

  const data = getCurrentData();
  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.customerCount)) : 1;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <MapPin className="text-green-600" size={32} />
        <h2 className="text-2xl font-bold text-gray-800">地域別分析</h2>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <button
          onClick={() => setViewMode('prefecture')}
          className={`py-3 px-4 rounded-xl font-bold transition-all ${
            viewMode === 'prefecture'
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          府県別
        </button>
        <button
          onClick={() => setViewMode('city')}
          className={`py-3 px-4 rounded-xl font-bold transition-all ${
            viewMode === 'city'
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          市区別
        </button>
        <button
          onClick={() => setViewMode('town')}
          className={`py-3 px-4 rounded-xl font-bold transition-all ${
            viewMode === 'town'
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          町別
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">読み込み中...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <MapPin size={48} className="mx-auto mb-4 text-gray-300" />
          <p>地域データがありません</p>
          <p className="text-sm mt-2">顧客登録時に住所を入力してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item, index) => {
            const percentage = (item.customerCount / maxCount) * 100;
            const isTop3 = index < 3;

            return (
              <div
                key={item.region}
                className={`rounded-xl border-2 p-4 transition-all hover:shadow-lg ${
                  isTop3
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
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
                    <div className="flex items-center gap-2">
                      <MapPin size={20} className="text-green-600" />
                      <span className="font-bold text-lg text-gray-900">{item.region}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Users size={18} className="text-blue-600" />
                      <span className="text-2xl font-bold text-blue-700">
                        {item.customerCount}
                      </span>
                      <span className="text-sm text-gray-600">人</span>
                    </div>
                  </div>
                </div>

                <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="absolute h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={14} className="text-orange-500" />
                    <span className="text-gray-600">来院回数:</span>
                    <span className="font-bold text-gray-800">{item.visitCount}回</span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-gray-600">累計売上:</span>
                    <span className="font-bold text-green-700">
                      ¥{item.totalRevenue.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
