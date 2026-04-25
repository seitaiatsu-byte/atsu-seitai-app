import { useState, useEffect } from 'react';
import { TrendingDown, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBusinessRules } from '../lib/businessRules';
import { repeatRateSecond, repeatRateSixth, type CustomerForRepeat } from '../lib/repeatMetrics';

export default function RepeatAnalysis() {
  const [repeat2, setRepeat2] = useState(0);
  const [repeat6, setRepeat6] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const rules = await fetchBusinessRules();
    const { data: visits } = await supabase.from('visit_records').select('customer_id, visit_date, menu_name');
    const byCust = new Map<string, { visit_date: string; menu_name?: string | null }[]>();
    (visits || []).forEach((v) => {
      if (!byCust.has(v.customer_id)) byCust.set(v.customer_id, []);
      byCust.get(v.customer_id)!.push({ visit_date: v.visit_date, menu_name: v.menu_name });
    });
    const list: CustomerForRepeat[] = [];
    byCust.forEach((listV, id) => list.push({ id, visits: listV }));
    setRepeat2(repeatRateSecond(list, rules.excludeKeywords));
    setRepeat6(repeatRateSixth(list, rules.excludeKeywords));
    setLoading(false);
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl shadow-lg p-6 border-2 border-slate-200">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="text-indigo-600" size={26} />
          <h2 className="text-xl font-bold text-gray-800">リピート率サマリ（全体）</h2>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border font-bold text-sm"
        >
          <RefreshCw size={16} />
          再計算
        </button>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        メニュー名に除外キーワードを含む来院はカウントから除外。詳細な院別分析は「日報月報」タブ内の詳細分析を参照。
      </p>
      {loading ? (
        <div className="text-center py-6 text-gray-500">計算中...</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-500 text-white p-4">
            <div className="text-xs font-bold">2回目リピート率</div>
            <div className="text-3xl font-bold">{repeat2}%</div>
          </div>
          <div className="rounded-xl bg-sky-600 text-white p-4">
            <div className="text-xs font-bold">6回目到達率</div>
            <div className="text-3xl font-bold">{repeat6}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
