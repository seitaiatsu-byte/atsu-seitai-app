import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBusinessRules } from '../lib/businessRules';
import { fetchUtilizationSchedule, type UtilizationScheduleConfig } from '../lib/clinicWeeklySchedule';
import { CLINIC_OPTIONS } from '../lib/clinic';
import { parseLocalVisitDateToYmd } from '../lib/visitDateParse';
import UtilizationGuidanceHint from './UtilizationGuidanceHint';
import {
  computeDecemberYoY,
  computeMonthlyUtilization,
  computeSeasonPair,
  computeUtilizationForPeriod,
  discoverYearsFromVisits,
  listMonthsInRange,
  rangeYmToYmd,
  utilizationBandForRate,
  yearToRange,
  ymToRange,
  type UtilizationResult,
  type UtilizationVisitRow,
} from '../lib/utilizationMetrics';

type ClinicFilter = 'all' | 'takatsuki' | 'kawanishi';
type ViewMode = 'month' | 'year' | 'range' | 'season';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toYm = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const fmtSlots = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function bandColorClass(rate: number): string {
  const band = utilizationBandForRate(rate);
  if (band.id === 'acquire') return 'text-slate-700 bg-slate-50 border-slate-200';
  if (band.id === 'stable') return 'text-emerald-800 bg-emerald-50 border-emerald-200';
  if (band.id === 'price_review') return 'text-amber-800 bg-amber-50 border-amber-200';
  if (band.id === 'expand') return 'text-orange-800 bg-orange-50 border-orange-200';
  return 'text-rose-800 bg-rose-50 border-rose-200';
}

function ResultRow({ result }: { result: UtilizationResult }) {
  const band = utilizationBandForRate(result.utilizationRate);
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${bandColorClass(result.utilizationRate)}`}
      title={band.action}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{result.label}</span>
        <span className="text-xl font-black">{result.utilizationRate}%</span>
      </div>
      <div className="text-[10px] opacity-80 mt-0.5">
        {fmtSlots(result.slotsUsed)} / {result.maxSlots} 枠（営業{result.operatingDays}日）
        {result.lowSample && <span className="ml-1 text-amber-700 font-bold">参考</span>}
      </div>
    </div>
  );
}

function MainRateCard({ result }: { result: UtilizationResult | null }) {
  if (!result) {
    return <div className="text-sm text-gray-500 py-4">この期間の来院データがありません。</div>;
  }
  const band = utilizationBandForRate(result.utilizationRate);
  return (
    <div className={`rounded-xl border-2 p-4 ${bandColorClass(result.utilizationRate)}`}>
      <div className="text-xs font-bold opacity-80">{result.label}</div>
      <div className="text-4xl font-black mt-1">{result.utilizationRate}%</div>
      <div className="text-xs mt-1 opacity-80">
        {fmtSlots(result.slotsUsed)} / {result.maxSlots} 枠（営業{result.operatingDays}日）
        {result.lowSample && <span className="ml-1 text-amber-700 font-bold">（短期間・参考値）</span>}
      </div>
      <p className="text-[11px] mt-2 leading-snug opacity-90">{band.action}</p>
    </div>
  );
}

export default function UtilizationAnalysis() {
  const now = new Date();
  const [clinicFilter, setClinicFilter] = useState<ClinicFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedYm, setSelectedYm] = useState(toYm(now));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [rangeStartYm, setRangeStartYm] = useState(`${now.getFullYear() - 1}-01`);
  const [rangeEndYm, setRangeEndYm] = useState(toYm(now));
  const [seasonYear, setSeasonYear] = useState(now.getFullYear());
  const [visits, setVisits] = useState<UtilizationVisitRow[]>([]);
  const [schedule, setSchedule] = useState<UtilizationScheduleConfig | null>(null);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>(['BE', '初回', '体験', '初']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rules, sched] = await Promise.all([fetchBusinessRules(), fetchUtilizationSchedule()]);
      const mustExclude = Array.from(new Set([...rules.excludeKeywords, '初']));
      setExcludeKeywords(mustExclude);
      setSchedule(sched);

      const { data, error: visitErr } = await supabase
        .from('visit_records')
        .select('visit_date, menu_name, clinic_name');
      if (visitErr) throw visitErr;

      const normalized: UtilizationVisitRow[] = (data || [])
        .map((v) => {
          const day = parseLocalVisitDateToYmd(String(v.visit_date ?? ''));
          if (!day) return null;
          return {
            visit_date: day,
            menu_name: v.menu_name,
            clinic_name: v.clinic_name,
          };
        })
        .filter((x): x is UtilizationVisitRow => Boolean(x));

      setVisits(normalized);
    } catch (e) {
      console.error('稼働率読込エラー:', e);
      setError('稼働率の集計に失敗しました');
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const availableYears = useMemo(() => discoverYearsFromVisits(visits), [visits]);

  const baseParams = useMemo(() => {
    if (!schedule) return null;
    return {
      visits,
      excludeKeywords,
      schedule,
      clinicFilter,
    };
  }, [visits, excludeKeywords, schedule, clinicFilter]);

  const monthResult = useMemo(() => {
    if (!baseParams) return null;
    const { startYmd, endYmd } = ymToRange(selectedYm);
    const [y, m] = selectedYm.split('-');
    return computeUtilizationForPeriod({
      ...baseParams,
      startYmd,
      endYmd,
      label: `${y}年${parseInt(m, 10)}月`,
    });
  }, [baseParams, selectedYm]);

  const yearResult = useMemo(() => {
    if (!baseParams) return null;
    const { startYmd, endYmd } = yearToRange(selectedYear);
    return computeUtilizationForPeriod({
      ...baseParams,
      startYmd,
      endYmd,
      label: `${selectedYear}年`,
    });
  }, [baseParams, selectedYear]);

  const rangeMonths = useMemo(() => {
    if (!baseParams) return [];
    return computeMonthlyUtilization({ ...baseParams, months: listMonthsInRange(rangeStartYm, rangeEndYm) });
  }, [baseParams, rangeStartYm, rangeEndYm]);

  const rangeTotal = useMemo(() => {
    if (!baseParams) return null;
    const { startYmd, endYmd } = rangeYmToYmd(rangeStartYm, rangeEndYm);
    return computeUtilizationForPeriod({
      ...baseParams,
      startYmd,
      endYmd,
      label: `${rangeStartYm} 〜 ${rangeEndYm}`,
    });
  }, [baseParams, rangeStartYm, rangeEndYm]);

  const decemberYoY = useMemo(() => {
    if (!baseParams) return [];
    const years =
      availableYears.length > 0
        ? availableYears
        : [selectedYear - 1, selectedYear, selectedYear + 1].filter((y) => y >= 2000);
    return computeDecemberYoY({ ...baseParams, years });
  }, [baseParams, availableYears, selectedYear]);

  const seasonPair = useMemo(() => {
    if (!baseParams) return null;
    return computeSeasonPair({ ...baseParams, year: seasonYear });
  }, [baseParams, seasonYear]);

  const yearOptions = useMemo(() => {
    if (availableYears.length) return availableYears;
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [availableYears, now]);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-sky-200 overflow-hidden">
      <div className="bg-gradient-to-r from-sky-50 to-blue-50 px-3 sm:px-4 py-3 border-b border-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="text-sky-700 shrink-0" size={22} />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-sky-900 leading-tight">稼働率分析</h2>
              <p className="text-[10px] sm:text-xs text-sky-800/80">
                加重枠（メニュー別）÷ 曜日別上限枠（祝日休診）。設定は「稼働率（週間枠・院別）」
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <div className="flex rounded-lg border border-sky-200 overflow-hidden text-xs font-bold">
              <button
                type="button"
                onClick={() => setClinicFilter('all')}
                className={`px-2 py-1 ${clinicFilter === 'all' ? 'bg-sky-600 text-white' : 'bg-white text-sky-800'}`}
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
                    className={`px-2 py-1 border-l border-sky-200 ${
                      clinicFilter === key ? 'bg-sky-600 text-white' : 'bg-white text-sky-800'
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
              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs font-bold text-sky-800 hover:bg-sky-50"
            >
              <RefreshCw size={14} />
              更新
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['month', '月次'],
              ['year', '年次'],
              ['range', '期間指定'],
              ['season', '季節・12月比較'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewMode(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${
                viewMode === key
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-sky-800 border-sky-200 hover:bg-sky-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-500">集計中…</p>}
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {!loading && !error && !baseParams && (
          <p className="text-sm text-gray-500">スケジュール設定を読み込めませんでした。</p>
        )}

        {!loading && !error && baseParams && viewMode === 'month' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              対象月
              <input
                type="month"
                value={selectedYm}
                onChange={(e) => setSelectedYm(e.target.value)}
                className="border-2 border-gray-200 rounded-lg px-2 py-1 font-mono text-sm"
              />
            </label>
            <MainRateCard result={monthResult} />
            {schedule?.excludeHolidays && (
              <p className="text-[10px] text-gray-500">祝日は国民の祝日カレンダーに従い分母から除外しています。</p>
            )}
          </div>
        )}

        {!loading && !error && baseParams && viewMode === 'year' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
              対象年
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="border-2 border-gray-200 rounded-lg px-2 py-1 font-mono text-sm"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
            </label>
            <MainRateCard result={yearResult} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {computeMonthlyUtilization({
                ...baseParams,
                months: Array.from({ length: 12 }, (_, i) => `${selectedYear}-${pad2(i + 1)}`),
              })
                .filter((r) => r.slotsUsed > 0)
                .map((r) => (
                  <ResultRow key={r.label} result={r} />
                ))}
            </div>
            {computeMonthlyUtilization({
              ...baseParams,
              months: Array.from({ length: 12 }, (_, i) => `${selectedYear}-${pad2(i + 1)}`),
            }).every((r) => r.slotsUsed === 0) && (
              <p className="text-xs text-gray-500">この年の来院データはまだありません。</p>
            )}
          </div>
        )}

        {!loading && !error && baseParams && viewMode === 'range' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-700">
              <label className="flex items-center gap-2">
                開始
                <input
                  type="month"
                  value={rangeStartYm}
                  onChange={(e) => setRangeStartYm(e.target.value)}
                  className="border-2 border-gray-200 rounded-lg px-2 py-1 font-mono font-normal"
                />
              </label>
              <span className="text-gray-400">〜</span>
              <label className="flex items-center gap-2">
                終了
                <input
                  type="month"
                  value={rangeEndYm}
                  onChange={(e) => setRangeEndYm(e.target.value)}
                  className="border-2 border-gray-200 rounded-lg px-2 py-1 font-mono font-normal"
                />
              </label>
            </div>
            <MainRateCard result={rangeTotal} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rangeMonths
                .filter((r) => r.slotsUsed > 0)
                .map((r) => (
                  <ResultRow key={r.startYmd} result={r} />
                ))}
            </div>
          </div>
        )}

        {!loading && !error && baseParams && viewMode === 'season' && seasonPair && (
          <div className="space-y-4">
            <section>
              <h3 className="text-sm font-bold text-gray-800 mb-2">12月 前年比較</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {decemberYoY
                  .filter((r) => r.slotsUsed > 0)
                  .map((r) => (
                    <ResultRow key={r.label} result={r} />
                  ))}
              </div>
              {decemberYoY.every((r) => r.slotsUsed === 0) && (
                <p className="text-xs text-gray-500">12月の来院データはまだありません。</p>
              )}
            </section>

            <section className="pt-2 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="text-sm font-bold text-gray-800">夏季 vs 冬季</h3>
                <select
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(parseInt(e.target.value, 10))}
                  className="border border-gray-200 rounded px-2 py-0.5 text-xs font-mono"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}年基準
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ResultRow result={seasonPair.summer} />
                <ResultRow result={seasonPair.winter} />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                夏季=7〜9月 / 冬季=前年12月〜当年2月（例: {seasonYear}年冬季は{seasonYear - 1}年12月〜
                {seasonYear}年2月）
              </p>
            </section>
          </div>
        )}

        <UtilizationGuidanceHint />
      </div>
    </div>
  );
}
