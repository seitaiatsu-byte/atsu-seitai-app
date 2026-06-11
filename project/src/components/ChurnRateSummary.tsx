import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchBusinessRules } from '../lib/businessRules';
import { fetchChurnConfig } from '../lib/churnConfig';
import {
  computeChurnSummaries,
  type ChurnMetricKind,
  type ChurnMetricSummary,
} from '../lib/churnMetrics';
import type { ChurnCustomerInput } from '../lib/churnMetrics';
import { CLINIC_OPTIONS } from '../lib/clinic';

type ClinicFilter = 'all' | 'takatsuki' | 'kawanishi';

function rateLabel(kind: ChurnMetricKind): string {
  if (kind === 'dropout') return '離脱';
  if (kind === 'continuation') return '継続購入';
  return '再診';
}

function rateColor(kind: ChurnMetricKind): string {
  if (kind === 'dropout') return 'text-rose-700';
  if (kind === 'continuation') return 'text-emerald-700';
  return 'text-indigo-700';
}

function WindowPills({ segment }: { segment: ChurnMetricSummary }) {
  const visible = segment.windows.filter((w) => w.denominator > 0);
  if (visible.length === 0) {
    return <span className="text-xs text-gray-500">観察完了の対象なし</span>;
  }
  const label = rateLabel(segment.kind);
  const color = rateColor(segment.kind);
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
          title={`${label} ${w.numerator} / ${w.denominator}`}
        >
          <span className="font-bold text-slate-600">{w.label}</span>
          <span className={`font-bold ${color}`}>{w.rate}%</span>
          <span className="text-[10px] text-gray-500">n={w.denominator}</span>
          {w.lowSample && <span className="text-[10px] text-amber-700">参考</span>}
        </span>
      ))}
    </div>
  );
}

function SegmentCard({ segment }: { segment: ChurnMetricSummary }) {
  const border =
    segment.kind === 'dropout'
      ? 'border-slate-200 bg-slate-50/50'
      : segment.kind === 'continuation'
        ? 'border-emerald-200 bg-emerald-50/40'
        : 'border-indigo-200 bg-indigo-50/40';
  const titleColor =
    segment.kind === 'dropout'
      ? 'text-slate-900'
      : segment.kind === 'continuation'
        ? 'text-emerald-900'
        : 'text-indigo-900';

  return (
    <section className={`rounded-lg border p-3 ${border}`}>
      <h3 className={`text-sm font-bold mb-0.5 ${titleColor}`}>{segment.segmentLabel}</h3>
      <p className="text-[10px] text-gray-600 mb-1.5 leading-snug">{segment.description}</p>
      <WindowPills segment={segment} />
    </section>
  );
}

export default function ChurnRateSummary() {
  const [clinicFilter, setClinicFilter] = useState<ClinicFilter>('all');
  const [segments, setSegments] = useState<ChurnMetricSummary[]>([]);
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

      const summaries = computeChurnSummaries({
        customers,
        excludeKeywords: rules.excludeKeywords,
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

  const flatSeg = segments.find((s) => s.segmentId === 'flat_be');
  const singleSeg = segments.find((s) => s.segmentId === 'single_dropout');
  const ticketSeg = segments.find((s) => s.segmentId === 'ticket_post_repurchase');
  const programSeg = segments.find((s) => s.segmentId === 'program_post_all');
  const programSubs = segments.filter((s) => s.segmentId.startsWith('program_post_prog_'));
  const revisitSeg = segments.find((s) => s.segmentId === 'revisit_rate');

  return (
    <div className="bg-white rounded-xl shadow-lg border border-teal-200 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-3 sm:px-4 py-3 border-b border-teal-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="text-teal-700 shrink-0" size={20} />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-teal-900 leading-tight">
                離脱・継続・再診（本商品起点）
              </h2>
              <p className="text-[10px] sm:text-xs text-teal-800/80 leading-snug">
                本商品購入日起点のフラット離脱／タイプ別の終了後継続／最終回後の再診率
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
        {loading && <p className="text-sm text-gray-500 py-2">集計中…</p>}
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {!loading && !error && (
          <>
            <p className="text-[11px] text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 leading-relaxed">
              通院カウント除外は<span className="font-bold">経営ルールの exclude_keywords のみ</span>
              （コード側で勝手に足しません）。初回のみの人は分母外。本商品キーワード・最終回・再診は
              <span className="font-bold text-teal-800">設定→経営ルール→離患判定</span>で編集。
            </p>

            {flatSeg && <SegmentCard segment={flatSeg} />}

            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">タイプ別（B）</h3>
              {singleSeg && <SegmentCard segment={singleSeg} />}
              {ticketSeg && <SegmentCard segment={ticketSeg} />}
              {programSeg && <SegmentCard segment={programSeg} />}
              {programSubs.map((sub) => (
                <SegmentCard key={sub.segmentId} segment={sub} />
              ))}
            </div>

            {revisitSeg && (
              <div className="pt-1">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">エピソード（C）</h3>
                <SegmentCard segment={revisitSeg} />
              </div>
            )}

            {!flatSeg && segments.length === 0 && (
              <p className="text-sm text-gray-500 py-2">本商品購入の記録がある顧客がまだありません。</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
