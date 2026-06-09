import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBusinessRules } from '../lib/businessRules';
import { fetchChurnConfig } from '../lib/churnConfig';
import { computeChurnSummaries, type ChurnSegmentSummary } from '../lib/churnMetrics';
import type { ChurnCustomerInput } from '../lib/churnMetrics';
import { CLINIC_OPTIONS } from '../lib/clinic';

type ClinicFilter = 'all' | 'takatsuki' | 'kawanishi';

function WindowPills({ windows }: { windows: ChurnSegmentSummary['windows'] }) {
  const visible = windows.filter((w) => w.denominator > 0);
  if (visible.length === 0) {
    return <span className="text-xs text-gray-500">観察完了コホートなし</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((w) => (
        <span
          key={w.windowDays}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
            w.lowSample
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
          title={`離患 ${w.churnedCount} / ${w.denominator}（継続 ${w.retentionRate}%）`}
        >
          <span className="font-bold text-slate-600">{w.label}</span>
          <span className="font-bold text-rose-700">{w.churnRate}%</span>
          <span className="text-[10px] text-gray-500">n={w.denominator}</span>
          {w.lowSample && <span className="text-[10px] text-amber-700">参考</span>}
        </span>
      ))}
    </div>
  );
}

export default function ChurnRateSummary() {
  const [clinicFilter, setClinicFilter] = useState<ClinicFilter>('all');
  const [segments, setSegments] = useState<ChurnSegmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rules, churnConfig, customersRes, visitsRes, pdRes] = await Promise.all([
        fetchBusinessRules(),
        fetchChurnConfig(),
        supabase.from('customers').select('id, customer_number'),
        supabase
          .from('visit_records')
          .select(
            'customer_id, visit_date, menu_name, import_kind_text, import_ticket_count_raw, payment_detail_id, clinic_name'
          ),
        supabase.from('payment_detail_master').select('id, name'),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (visitsRes.error) throw visitsRes.error;

      const paymentDetailNames: Record<string, string> = {};
      (pdRes.data || []).forEach((r: { id: string; name: string }) => {
        paymentDetailNames[r.id] = r.name;
      });

      const visitsByCustomer = new Map<string, ChurnCustomerInput['visits']>();
      (visitsRes.data || []).forEach((v) => {
        const list = visitsByCustomer.get(v.customer_id) || [];
        list.push(v);
        visitsByCustomer.set(v.customer_id, list);
      });

      const customers: ChurnCustomerInput[] = (customersRes.data || []).map((c) => ({
        id: c.id,
        customer_number: c.customer_number,
        visits: visitsByCustomer.get(c.id) || [],
      }));

      const excludeKeywords = Array.from(new Set([...rules.excludeKeywords, '初']));
      const summaries = computeChurnSummaries({
        customers,
        excludeKeywords,
        churnConfig,
        paymentDetailNames,
        clinicFilter,
      });
      setSegments(summaries);
    } catch (e) {
      console.error('離患率サマリー読込エラー:', e);
      setError('離患率の集計に失敗しました');
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }, [clinicFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const singleSeg = segments.find((s) => s.segmentId === 'single');
  const programAll = segments.find((s) => s.segmentId === 'program');
  const programSubs = segments.filter((s) => s.contractType === 'program' && s.programSubType);
  const ticketSeg = segments.find((s) => s.segmentId === 'ticket');

  return (
    <div className="bg-white rounded-xl shadow-lg border border-teal-200 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-3 sm:px-4 py-3 border-b border-teal-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="text-teal-700 shrink-0" size={20} />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-teal-900 leading-tight">離患率（契約タイプ別）</h2>
              <p className="text-[10px] sm:text-xs text-teal-800/80 leading-snug">
                成約後、観察期間内に再来院がなかった割合（コホート型・BE/初回/体験除く）
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex rounded-lg border border-teal-200 overflow-hidden text-xs font-bold">
              <button
                type="button"
                onClick={() => setClinicFilter('all')}
                className={`px-2 py-1 ${clinicFilter === 'all' ? 'bg-teal-600 text-white' : 'bg-white text-teal-800'}`}
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
                    className={`px-2 py-1 border-l border-teal-200 ${
                      clinicFilter === key ? 'bg-teal-600 text-white' : 'bg-white text-teal-800'
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
              className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-white px-2 py-1 text-xs font-bold text-teal-800 hover:bg-teal-50"
            >
              <RefreshCw size={14} />
              更新
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {loading && <p className="text-sm text-gray-500 py-2">離患率を集計中…</p>}
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {!loading && !error && (
          <>
            <p className="text-[11px] text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              分類キーワード・観察窓は<span className="font-bold text-teal-800">設定→経営ルール→離患判定</span>
              で変更。詳細は <code className="text-[10px]">docs/churn-rate-design.md</code>
            </p>

            {singleSeg && (
              <section className="rounded-lg border border-orange-200 bg-orange-50/40 p-3">
                <h3 className="text-sm font-bold text-orange-900 mb-1.5">{singleSeg.segmentLabel}</h3>
                <WindowPills windows={singleSeg.windows} />
              </section>
            )}

            {programAll && (
              <section className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                <h3 className="text-sm font-bold text-blue-900">{programAll.segmentLabel}</h3>
                <WindowPills windows={programAll.windows} />
                {programSubs.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-blue-200/80">
                    {programSubs.map((sub) => (
                      <div key={sub.segmentId}>
                        <div className="text-xs font-bold text-blue-800 mb-1">{sub.segmentLabel}</div>
                        <WindowPills windows={sub.windows} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {ticketSeg && (
              <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <h3 className="text-sm font-bold text-violet-900 mb-1.5">{ticketSeg.segmentLabel}</h3>
                <WindowPills windows={ticketSeg.windows} />
              </section>
            )}

            {!singleSeg && !programAll && !ticketSeg && (
              <p className="text-sm text-gray-500 py-2">有効来院のある顧客データがまだありません。</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
