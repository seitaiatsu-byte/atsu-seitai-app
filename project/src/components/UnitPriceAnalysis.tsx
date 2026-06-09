import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBusinessRules } from '../lib/businessRules';
import { CLINIC_OPTIONS } from '../lib/clinic';
import { parseLocalVisitDateToYmd } from '../lib/visitDateParse';
import {
  computeOverallUnitPrice,
  computeUnitPriceSummaries,
  type UnitPriceVisitRow,
} from '../lib/unitPriceMetrics';
import { ymToRange } from '../lib/utilizationMetrics';

type ClinicFilter = 'all' | 'takatsuki' | 'kawanishi';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toYm = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

export default function UnitPriceAnalysis() {
  const now = new Date();
  const [clinicFilter, setClinicFilter] = useState<ClinicFilter>('all');
  const [selectedYm, setSelectedYm] = useState(toYm(now));
  const [visits, setVisits] = useState<UnitPriceVisitRow[]>([]);
  const [menuDurationRules, setMenuDurationRules] = useState('');
  const [defaultTreatmentMinutes, setDefaultTreatmentMinutes] = useState(60);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>(['BE', '初回', '体験', '初']);
  const [paymentDetailNames, setPaymentDetailNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rules = await fetchBusinessRules();
      setExcludeKeywords(Array.from(new Set([...rules.excludeKeywords, '初'])));
      setMenuDurationRules(rules.menuDurationRules);
      setDefaultTreatmentMinutes(rules.defaultTreatmentMinutes);

      const [visRes, pdRes] = await Promise.all([
        supabase.from('visit_records').select(
          'visit_date, menu_name, amount, treatment_minutes, clinic_name, payment_detail_id'
        ),
        supabase.from('payment_detail_master').select('id, name'),
      ]);
      if (visRes.error) throw visRes.error;

      const pdMap: Record<string, string> = {};
      (pdRes.data || []).forEach((r: { id: string; name: string }) => {
        pdMap[r.id] = r.name;
      });
      setPaymentDetailNames(pdMap);

      const normalized: UnitPriceVisitRow[] = (visRes.data || [])
        .map((v) => {
          const day = parseLocalVisitDateToYmd(String(v.visit_date ?? ''));
          if (!day) return null;
          return {
            visit_date: day,
            menu_name: v.menu_name,
            amount: v.amount,
            treatment_minutes: v.treatment_minutes,
            clinic_name: v.clinic_name,
            payment_detail_id: v.payment_detail_id,
          };
        })
        .filter((x): x is UnitPriceVisitRow => Boolean(x));
      setVisits(normalized);
    } catch (e) {
      console.error('分単価読込エラー:', e);
      setError('分単価の集計に失敗しました');
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { startYmd, endYmd } = useMemo(() => ymToRange(selectedYm), [selectedYm]);

  const segments = useMemo(
    () =>
      computeUnitPriceSummaries({
        visits,
        excludeKeywords,
        clinicFilter,
        startYmd,
        endYmd,
        menuDurationRules,
        defaultTreatmentMinutes,
        paymentDetailNames,
      }),
    [
      visits,
      excludeKeywords,
      clinicFilter,
      startYmd,
      endYmd,
      menuDurationRules,
      defaultTreatmentMinutes,
      paymentDetailNames,
    ]
  );

  const overall = useMemo(() => computeOverallUnitPrice(segments), [segments]);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-violet-200 overflow-hidden">
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-3 sm:px-4 py-3 border-b border-violet-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock3 className="text-violet-700 shrink-0" size={22} />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-violet-900 leading-tight">時間単価（分単価）</h2>
              <p className="text-[10px] sm:text-xs text-violet-800/80">
                その回の金額 ÷ 枠時間（分）。来院入力の実績を優先
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <div className="flex rounded-lg border border-violet-200 overflow-hidden text-xs font-bold">
              <button
                type="button"
                onClick={() => setClinicFilter('all')}
                className={`px-2 py-1 ${clinicFilter === 'all' ? 'bg-violet-600 text-white' : 'bg-white text-violet-800'}`}
              >
                全院
              </button>
              {CLINIC_OPTIONS.map((c) => {
                const key = c.value.includes('高槻') ? 'takatsuki' : 'kawanishi';
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setClinicFilter(key as ClinicFilter)}
                    className={`px-2 py-1 border-l border-violet-200 ${
                      clinicFilter === key ? 'bg-violet-600 text-white' : 'bg-white text-violet-800'
                    }`}
                  >
                    {c.short}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-bold text-violet-800 hover:bg-violet-50"
            >
              <RefreshCw size={14} />
              更新
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-4">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          対象月
          <input
            type="month"
            value={selectedYm}
            onChange={(e) => setSelectedYm(e.target.value)}
            className="border-2 border-gray-200 rounded-lg px-2 py-1 font-mono text-sm"
          />
        </label>

        <p className="text-[11px] text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 leading-snug">
          <strong>ルール：</strong>来院入力で「金額」と「枠時間（分）」を入れた分が一番正確です。
          古いデータで時間が空いている場合だけ、設定のメニュー別時間から推測します。
        </p>

        {loading && <p className="text-sm text-gray-500">集計中…</p>}
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {!loading && !error && overall && (
          <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4">
            <div className="text-xs font-bold text-violet-800">全体（加重平均）</div>
            <div className="text-3xl font-black text-violet-900 mt-1">¥{overall.yenPerMinute.toLocaleString()}/分</div>
            <div className="text-[11px] text-violet-800/80 mt-1">
              {overall.visitCount}件
              {overall.estimatedCount > 0 && (
                <span className="text-amber-700">（うち推測 {overall.estimatedCount}件）</span>
              )}
            </div>
          </div>
        )}

        {!loading && !error && segments.length === 0 && (
          <p className="text-sm text-gray-500">この月の対象来院（金額あり）がありません。</p>
        )}

        {!loading && !error && segments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {segments.map((s) => (
              <div key={s.segmentId} className="rounded-lg border border-violet-200 bg-white px-3 py-2">
                <div className="text-sm font-bold text-gray-800">{s.label}</div>
                <div className="text-2xl font-black text-violet-800">¥{s.yenPerMinute.toLocaleString()}/分</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {s.visitCount}件 · ¥{Math.round(s.totalAmount).toLocaleString()} / {s.totalMinutes}分
                  {s.estimatedCount > 0 && (
                    <span className="text-amber-700 ml-1">推測{s.estimatedCount}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
