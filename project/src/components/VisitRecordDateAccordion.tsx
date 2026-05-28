import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getVisitFieldRows, groupVisitsByDate, type VisitRow } from '../lib/visitRecordFieldRows';
import { ClinicNameFromVisitClinicName } from './ClinicNameDisplay';

type CustomerLite = { customer_number: string | null; name: string };

type VisitWithJoin = VisitRow & { customers?: { name?: string; customer_number?: string | null } | null };

type Props = {
  visits: VisitWithJoin[];
  customer: CustomerLite | null;
  methodIdToName: Record<string, string>;
  detailIdToName: Record<string, string>;
  /** 展開する日付キー(YYYY-MM-DD)。未指定なら直近1日だけ開く */
  defaultExpandFirst?: boolean;
  renderCardActions?: (v: VisitWithJoin) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
};

export default function VisitRecordDateAccordion({
  visits,
  customer,
  methodIdToName,
  detailIdToName,
  defaultExpandFirst = true,
  renderCardActions,
  emptyMessage = '履歴はまだありません',
  className = '',
}: Props) {
  const byDate = useMemo(() => groupVisitsByDate(visits), [visits]);
  const sortedDates = useMemo(
    () => [...byDate.keys()].filter((d) => d !== '—').sort((a, b) => b.localeCompare(a)),
    [byDate]
  );
  const tree = useMemo(() => {
    const yearMap = new Map<string, Map<string, string[]>>();
    for (const dateKey of sortedDates) {
      const [y, m] = dateKey.split('-');
      if (!y || !m) continue;
      if (!yearMap.has(y)) yearMap.set(y, new Map<string, string[]>());
      const monthMap = yearMap.get(y)!;
      if (!monthMap.has(m)) monthMap.set(m, []);
      monthMap.get(m)!.push(dateKey);
    }
    return [...yearMap.entries()].map(([year, monthMap]) => ({
      year,
      months: [...monthMap.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, days]) => ({
          month,
          days: [...days].sort((a, b) => b.localeCompare(a)),
        })),
    }));
  }, [sortedDates]);
  const firstYear = tree[0]?.year ?? null;
  const firstMonthKey = tree[0]?.months[0] ? `${tree[0].year}-${tree[0].months[0].month}` : null;
  const firstDateKey = tree[0]?.months[0]?.days[0] ?? null;
  const orphan = byDate.get('—') || [];

  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!defaultExpandFirst || !firstDateKey || !firstYear || !firstMonthKey) return;
    setOpenYears(new Set([firstYear]));
    setOpenMonths(new Set([firstMonthKey]));
    setOpenDays(new Set([firstDateKey]));
  }, [defaultExpandFirst, firstDateKey, firstYear, firstMonthKey, visits.length]);

  const toggleYear = (year: string) => {
    setOpenYears((prev) => {
      const n = new Set(prev);
      if (n.has(year)) n.delete(year);
      else n.add(year);
      return n;
    });
  };
  const toggleMonth = (monthKey: string) => {
    setOpenMonths((prev) => {
      const n = new Set(prev);
      if (n.has(monthKey)) n.delete(monthKey);
      else n.add(monthKey);
      return n;
    });
  };
  const toggleDay = (dayKey: string) => {
    setOpenDays((prev) => {
      const n = new Set(prev);
      if (n.has(dayKey)) n.delete(dayKey);
      else n.add(dayKey);
      return n;
    });
  };

  if (visits.length === 0) {
    return <p className="text-sm text-gray-500 py-4">{emptyMessage}</p>;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {tree.map(({ year, months }) => {
        const yearKey = `y-${year}`;
        const yearDates = months.flatMap((m) => m.days);
        const yearVisits = yearDates.flatMap((d) => byDate.get(d) || []);
        const yearSum = yearVisits.reduce((s, v) => s + Number(v.amount || 0), 0);
        const isYearOpen = openYears.has(year);
        return (
          <div
            key={yearKey}
            className="rounded-2xl border-2 border-slate-200/80 bg-white shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleYear(year)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-gradient-to-r from-slate-50 to-slate-100/80 hover:from-slate-100 hover:to-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                {isYearOpen ? <ChevronDown className="shrink-0 text-slate-600" size={22} /> : <ChevronRight className="shrink-0 text-slate-600" size={22} />}
                <span className="font-bold text-slate-800 truncate">{year}年</span>
                <span className="text-xs font-bold text-slate-500 shrink-0">
                  {yearVisits.length}件
                </span>
              </span>
              <span className="text-sm font-bold text-blue-700 shrink-0">計 ¥{yearSum.toLocaleString()}</span>
            </button>
            {isYearOpen && (
              <div className="p-2 space-y-2 bg-slate-50/50">
                {months.map(({ month, days }) => {
                  const monthKey = `${year}-${month}`;
                  const monthVisits = days.flatMap((d) => byDate.get(d) || []);
                  const monthSum = monthVisits.reduce((s, v) => s + Number(v.amount || 0), 0);
                  const isMonthOpen = openMonths.has(monthKey);
                  return (
                    <div key={monthKey} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {isMonthOpen ? (
                            <ChevronDown className="shrink-0 text-slate-600" size={18} />
                          ) : (
                            <ChevronRight className="shrink-0 text-slate-600" size={18} />
                          )}
                          <span className="font-bold text-slate-800 truncate">{parseInt(month, 10)}月</span>
                          <span className="text-xs font-bold text-slate-500 shrink-0">{monthVisits.length}件</span>
                        </span>
                        <span className="text-sm font-bold text-blue-700 shrink-0">計 ¥{monthSum.toLocaleString()}</span>
                      </button>
                      {isMonthOpen && (
                        <div className="p-2 space-y-2 bg-slate-50/40">
                          {days.map((dateKey) => {
                            const dayVisits = byDate.get(dateKey) || [];
                            const label = new Date(dateKey + 'T12:00:00').toLocaleDateString('ja-JP', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            });
                            const sum = dayVisits.reduce((s, v) => s + Number(v.amount || 0), 0);
                            const isDayOpen = openDays.has(dateKey);
                            return (
                              <div key={dateKey} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => toggleDay(dateKey)}
                                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    {isDayOpen ? (
                                      <ChevronDown className="shrink-0 text-slate-600" size={18} />
                                    ) : (
                                      <ChevronRight className="shrink-0 text-slate-600" size={18} />
                                    )}
                                    <span className="font-bold text-slate-800 truncate">{label}</span>
                                    <span className="text-xs font-bold text-slate-500 shrink-0">{dayVisits.length}件</span>
                                  </span>
                                  <span className="text-sm font-bold text-blue-700 shrink-0">計 ¥{sum.toLocaleString()}</span>
                                </button>
                                {isDayOpen && (
                                  <div className="p-3 space-y-3 bg-slate-50/50">
                                    {dayVisits.map((v) => (
                                      <VisitDetailCard
                                        key={v.id}
                                        v={v}
                                        customer={customer}
                                        methodIdToName={methodIdToName}
                                        detailIdToName={detailIdToName}
                                        actions={renderCardActions?.(v)}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {orphan.length > 0 && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-900">
          日付不明の行が {orphan.length} 件あります
        </div>
      )}
    </div>
  );
}

function VisitDetailCard({
  v,
  customer,
  methodIdToName,
  detailIdToName,
  actions,
}: {
  v: VisitWithJoin;
  customer: CustomerLite | null;
  methodIdToName: Record<string, string>;
  detailIdToName: Record<string, string>;
  actions?: React.ReactNode;
}) {
  const rows = getVisitFieldRows(v, { customer, methodIdToName, detailIdToName });
  const displayRows = rows.filter((r) => r.key !== 'pdd' && r.key !== 'tk');
  const hasMedia = (v.media_urls && v.media_urls.length > 0) || false;

  return (
    <div className="rounded-xl border border-white bg-white p-2.5 shadow-sm ring-1 ring-slate-200/60">
      <div className="grid grid-cols-1 gap-y-1.5 text-xs">
        {displayRows.map((r) => (
          <div key={r.key} className="flex items-start gap-2 border-b border-slate-100 pb-1 last:border-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 w-24 shrink-0">
              {r.label}
            </span>
            <span className="text-slate-900 font-medium break-words whitespace-pre-wrap min-w-0 leading-tight">
              {r.key === 'cl' ? (
                <ClinicNameFromVisitClinicName clinicName={v.clinic_name} emptyLabel="—" />
              ) : (
                r.value
              )}
            </span>
          </div>
        ))}
        {hasMedia && (
          <div>
            <span className="text-[10px] font-bold text-slate-500">添付画像</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {(v.media_urls || []).slice(0, 6).map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  画像
                </a>
              ))}
              {v.media_urls && v.media_urls.length > 6 && (
                <span className="text-xs text-gray-500">他{v.media_urls.length - 6}件</span>
              )}
            </div>
          </div>
        )}
      </div>
      {actions && <div className="mt-2 flex justify-end gap-1 pt-2 border-t border-slate-100">{actions}</div>}
    </div>
  );
}
