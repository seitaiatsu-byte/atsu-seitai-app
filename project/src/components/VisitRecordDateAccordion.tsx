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
  const firstDateKey = sortedDates[0] ?? null;
  const orphan = byDate.get('—') || [];

  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!defaultExpandFirst || !firstDateKey) return;
    setOpen(new Set([firstDateKey]));
  }, [defaultExpandFirst, firstDateKey, visits.length]);

  const toggle = (d: string) => {
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  };

  if (visits.length === 0) {
    return <p className="text-sm text-gray-500 py-4">{emptyMessage}</p>;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {sortedDates.map((dateKey) => {
        const dayVisits = byDate.get(dateKey) || [];
        const label = new Date(dateKey + 'T12:00:00').toLocaleDateString('ja-JP', {
          weekday: 'short',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const sum = dayVisits.reduce((s, v) => s + Number(v.amount || 0), 0);
        const isOpen = open.has(dateKey);
        return (
          <div
            key={dateKey}
            className="rounded-2xl border-2 border-slate-200/80 bg-white shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(dateKey)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-gradient-to-r from-slate-50 to-slate-100/80 hover:from-slate-100 hover:to-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                {isOpen ? <ChevronDown className="shrink-0 text-slate-600" size={22} /> : <ChevronRight className="shrink-0 text-slate-600" size={22} />}
                <span className="font-bold text-slate-800 truncate">{label}</span>
                <span className="text-xs font-bold text-slate-500 shrink-0">
                  {dayVisits.length}件
                </span>
              </span>
              <span className="text-sm font-bold text-blue-700 shrink-0">計 ¥{sum.toLocaleString()}</span>
            </button>
            {isOpen && (
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
  const hasMedia = (v.media_urls && v.media_urls.length > 0) || false;

  return (
    <div className="rounded-xl border-2 border-white bg-white p-3 shadow-sm ring-1 ring-slate-200/60">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 border-b border-slate-100 pb-1.5 last:border-0 sm:border-0 sm:pb-0">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:w-28 shrink-0">
              {r.label}
            </span>
            <span className="text-slate-900 font-medium break-words whitespace-pre-wrap min-w-0">
              {r.key === 'cl' ? (
                <ClinicNameFromVisitClinicName clinicName={v.clinic_name} emptyLabel="—" />
              ) : (
                r.value
              )}
            </span>
          </div>
        ))}
        {hasMedia && (
          <div className="col-span-1 sm:col-span-2">
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
      {actions && <div className="mt-3 flex justify-end gap-1 pt-2 border-t border-slate-100">{actions}</div>}
    </div>
  );
}
