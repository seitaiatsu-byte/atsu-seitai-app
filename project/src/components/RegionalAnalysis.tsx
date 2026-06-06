import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin, Download, Pencil, ChevronRight } from 'lucide-react';
import ModalCloseButton from './ModalCloseButton';
import { supabase } from '../lib/supabase';
import { fetchAllCustomersByCreatedDesc, type CustomerRow } from '../lib/fetchAllCustomers';
import { downloadCustomersCsv } from '../lib/customerCsvExport';
import { isRealCustomerNumber } from '../lib/customerNumber';
import CustomerRosterEditModal from './CustomerRosterEditModal';
import type { ClinicScope } from './ClinicScopeToggle';

interface RegionData {
  region: string;
  customerCount: number;
  visitCount: number;
  totalRevenue: number;
}

type ViewMode = 'prefecture' | 'city' | 'town';
type SegmentKey = 'all' | 'takatsuki' | 'kawanishi';

interface RegionalAnalysisProps {
  clinicScope: ClinicScope;
}

function regionLabel(v: string | null | undefined): string {
  const s = String(v ?? '').trim();
  return s || '\u672a\u8a2d\u5b9a';
}

function viewModeLabel(mode: ViewMode): string {
  if (mode === 'prefecture') return '\u5e9c\u770c\u5225';
  if (mode === 'city') return '\u5e02\u533a\u5225';
  return '\u753a\u5225';
}

function regionField(mode: ViewMode, c: CustomerRow): string {
  if (mode === 'prefecture') return regionLabel(c.prefecture);
  if (mode === 'city') return regionLabel(c.city);
  return regionLabel(c.town);
}

function compareCustomerNumber(a: CustomerRow, b: CustomerRow): number {
  const an = String(a.customer_number ?? '').trim();
  const bn = String(b.customer_number ?? '').trim();
  const ad = an.replace(/\D/g, '');
  const bd = bn.replace(/\D/g, '');
  if (ad && bd && ad !== bd) {
    const na = Number(ad);
    const nb = Number(bd);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  }
  return an.localeCompare(bn, undefined, { numeric: true });
}

export default function RegionalAnalysis({ clinicScope }: RegionalAnalysisProps) {
  const [segmentedData, setSegmentedData] = useState<Record<SegmentKey, Record<ViewMode, RegionData[]>>>({
    all: { prefecture: [], city: [], town: [] },
    takatsuki: { prefecture: [], city: [], town: [] },
    kawanishi: { prefecture: [], city: [], town: [] },
  });
  const [customersByRegion, setCustomersByRegion] = useState<Map<string, CustomerRow[]>>(new Map());
  const [allCustomers, setAllCustomers] = useState<CustomerRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('city');
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('takatsuki');
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<{ segment: SegmentKey; region: string } | null>(null);
  const [editCustomer, setEditCustomer] = useState<CustomerRow | null>(null);

  const loadRegionalData = useCallback(async () => {
    setLoading(true);
    let customers: CustomerRow[] = [];
    try {
      customers = await fetchAllCustomersByCreatedDesc();
    } catch (e) {
      console.error('\u9867\u5ba2\u540d\u7c3f\u306e\u53d6\u5f97\u306b\u5931\u6557:', e);
    }
    const toCustomerNumber = (c: CustomerRow): number | null => {
      const digits = String(c.customer_number ?? '').replace(/\D/g, '');
      if (!digits) return null;
      const n = Number(digits);
      return Number.isFinite(n) ? n : null;
    };
    const isTakatsuki = (c: CustomerRow) => {
      const n = toCustomerNumber(c);
      return n !== null && n >= 5000 && n <= 9999;
    };
    const isKawanishi = (c: CustomerRow) => {
      const n = toCustomerNumber(c);
      return n !== null && n >= 1 && n <= 4999;
    };
    customers = customers.filter((c) => isRealCustomerNumber(c.customer_number));

    // 地域分析は「全体」「高槻院(5000+)」「川西院(1-4999)」を同時表示
    const segmentCustomers: Record<SegmentKey, CustomerRow[]> = {
      all: customers,
      takatsuki: customers.filter(isTakatsuki),
      kawanishi: customers.filter(isKawanishi),
    };
    setAllCustomers(customers);

    const { data: visitsRaw } = await supabase.from('visit_records').select('customer_id, amount');
    const visits = visitsRaw || [];

    const buildForMode = (mode: ViewMode, scopedCustomers: CustomerRow[]) => {
      const customerMap = new Map<string, { prefecture: string; city: string; town: string }>();
      scopedCustomers.forEach((c) => {
        customerMap.set(c.id, {
          prefecture: regionLabel(c.prefecture),
          city: regionLabel(c.city),
          town: regionLabel(c.town),
        });
      });
      const stats = new Map<string, { count: number; visits: number; revenue: number }>();
      const byRegion = new Map<string, CustomerRow[]>();
      scopedCustomers.forEach((c) => {
        const key = regionField(mode, c);
        if (!stats.has(key)) stats.set(key, { count: 0, visits: 0, revenue: 0 });
        stats.get(key)!.count++;
        if (!byRegion.has(key)) byRegion.set(key, []);
        byRegion.get(key)!.push(c);
      });
      visits.forEach((v) => {
        const loc = customerMap.get(v.customer_id);
        if (!loc) return;
        const key = mode === 'prefecture' ? loc.prefecture : mode === 'city' ? loc.city : loc.town;
        const stat = stats.get(key);
        if (stat) {
          stat.visits++;
          stat.revenue += Number(v.amount || 0);
        }
      });
      const rows = Array.from(stats.entries())
        .map(([region, s]) => ({
          region,
          customerCount: s.count,
          visitCount: s.visits,
          totalRevenue: s.revenue,
        }))
        .sort((a, b) => b.customerCount - a.customerCount);
      return { data: rows, byRegion };
    };

    const allSegmentData: Record<SegmentKey, Record<ViewMode, RegionData[]>> = {
      all: { prefecture: [], city: [], town: [] },
      takatsuki: { prefecture: [], city: [], town: [] },
      kawanishi: { prefecture: [], city: [], town: [] },
    };
    const merged = new Map<string, CustomerRow[]>();
    const attach = (segment: SegmentKey, mode: ViewMode, m: Map<string, CustomerRow[]>) => {
      m.forEach((list, region) => merged.set(`${segment}:${mode}:${region}`, list));
    };

    (['all', 'takatsuki', 'kawanishi'] as const).forEach((segment) => {
      const pref = buildForMode('prefecture', segmentCustomers[segment]);
      const city = buildForMode('city', segmentCustomers[segment]);
      const town = buildForMode('town', segmentCustomers[segment]);
      allSegmentData[segment] = {
        prefecture: pref.data,
        city: city.data,
        town: town.data,
      };
      attach(segment, 'prefecture', pref.byRegion);
      attach(segment, 'city', city.byRegion);
      attach(segment, 'town', town.byRegion);
    });

    setSegmentedData(allSegmentData);
    setCustomersByRegion(merged);
    setLoading(false);
  }, [clinicScope]);

  useEffect(() => {
    loadRegionalData();
    const reload = () => loadRegionalData();
    window.addEventListener('customers-updated', reload);
    return () => window.removeEventListener('customers-updated', reload);
  }, [loadRegionalData]);

  const segmentTitle = (segment: SegmentKey) => {
    if (segment === 'all') return '全体（両院）';
    if (segment === 'takatsuki') return '高槻院（5000番以降）';
    return '川西院（1～4999番）';
  };

  const drilldownCustomers = useMemo(() => {
    if (!selectedRegion) return [];
    const list = customersByRegion.get(`${selectedRegion.segment}:${viewMode}:${selectedRegion.region}`) || [];
    return [...list].sort(compareCustomerNumber);
  }, [customersByRegion, selectedRegion, viewMode]);

  const handleExportAll = () => {
    const d = new Date().toISOString().slice(0, 10);
    downloadCustomersCsv(allCustomers, `\u9867\u5ba2\u540d\u7c3f_\u5730\u57df\u4fee\u6b63\u7528_${d}.csv`);
  };

  const handleExportDrilldown = () => {
    if (!selectedRegion || drilldownCustomers.length === 0) return;
    const safe = selectedRegion.region.replace(/[\\/:*?"<>|]/g, '_');
    downloadCustomersCsv(
      drilldownCustomers,
      `\u9867\u5ba2\u540d\u7c3f_${segmentTitle(selectedRegion.segment)}_${viewModeLabel(viewMode)}_${safe}.csv`
    );
  };

  const handleSaved = () => {
    setEditCustomer(null);
    loadRegionalData();
    window.dispatchEvent(new Event('customers-updated'));
  };

  const switchMode = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedRegion(null);
  };

  const switchSegment = (segment: SegmentKey) => {
    setActiveSegment(segment);
    setSelectedRegion(null);
  };

  const SEGMENT_TABS: { key: SegmentKey; label: string }[] = [
    { key: 'takatsuki', label: '高槻院' },
    { key: 'kawanishi', label: '川西院' },
    { key: 'all', label: '全体' },
  ];

  const activeData = segmentedData[activeSegment][viewMode];
  const activeMaxCount = activeData.length > 0 ? Math.max(...activeData.map((d) => d.customerCount)) : 1;

  const t = {
    title: '\u5730\u57df\u5225\u5206\u6790',
    csvAll: '\u540d\u7c3fCSV\uff08\u5168\u4ef6\uff09',
    help: '\u4f4f\u6240\u306e\u4e00\u62ec\u4fee\u6b63\u306f\u3001\u540d\u7c3fCSV\u3092Excel\u3067\u7de8\u96c6\u3057\u3001\u8a2d\u5b9a\u30bf\u30d6\u306e\u300c\u540d\u7c3f\u53d6\u8fbc\u300d\u304b\u3089\u518d\u30a2\u30c3\u30d7\u30ed\u30fc\u30c9\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u884c\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u9867\u5ba2\u4e00\u89a7\u3001\u925b\u7b14\u30a2\u30a4\u30b3\u30f3\u3067\u500b\u5225\u7de8\u96c6\u3067\u304d\u307e\u3059\u3002',
    pref: '\u5e9c\u770c\u5225',
    city: '\u5e02\u533a\u5225',
    town: '\u753a\u5225',
    loading: '\u8aad\u307f\u8fbc\u307f\u4e2d...',
    noData: '\u5730\u57df\u30c7\u30fc\u30bf\u304c\u3042\u308a\u307e\u305b\u3093',
    noDataHint: '\u9867\u5ba2\u767b\u9332\u6642\u306b\u4f4f\u6240\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044',
    people: '\u4eba',
    visits: '\u6765\u9662\u56de\u6570:',
    visitsUnit: '\u56de',
    revenue: '\u7d2f\u8a08\u58f2\u4e0a:',
    yen: '\u00a5',
    modalTitle: '\u9867\u5ba2\u4e00\u89a7',
    colNo: '\u9867\u5ba2\u756a\u53f7',
    colName: '\u6c0f\u540d',
    colPref: '\u90fd\u5e9c\u770c',
    colCity: '\u5e02\u533a',
    colTown: '\u753a',
    colEdit: '\u7de8\u96c6',
    exportRegion: '\u3053\u306e\u5730\u57df\u306eCSV',
    close: '\u9589\u3058\u308b',
  };

  const segmentBtnClass = (key: SegmentKey, active: boolean) => {
    if (!active) return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
    if (key === 'takatsuki') return 'bg-blue-600 text-white shadow';
    if (key === 'kawanishi') return 'bg-orange-500 text-white shadow';
    return 'bg-slate-700 text-white shadow';
  };

  const modeBtnClass = (active: boolean) =>
    active
      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow'
      : 'bg-gray-100 text-gray-700 hover:bg-gray-200';

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-sm:p-2 max-sm:rounded-xl">
      <div className="hidden sm:flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <MapPin className="text-green-600" size={32} />
          <h2 className="text-2xl font-bold text-gray-800">{t.title}</h2>
        </div>
        <button
          type="button"
          onClick={handleExportAll}
          disabled={loading || allCustomers.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 to-emerald-500 shadow hover:opacity-90 disabled:opacity-50"
        >
          <Download size={18} />
          {t.csvAll}
        </button>
      </div>

      <div className="sm:hidden flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-bold text-gray-800">{t.title}</h2>
        <button
          type="button"
          onClick={handleExportAll}
          disabled={loading || allCustomers.length === 0}
          aria-label={t.csvAll}
          className="p-1.5 rounded-lg font-bold text-white bg-gradient-to-r from-green-500 to-emerald-500 disabled:opacity-50"
        >
          <Download size={16} />
        </button>
      </div>

      <p className="hidden sm:block text-sm text-gray-600 mb-3">{t.help}</p>

      <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-1 sm:mb-3">
        {SEGMENT_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchSegment(key)}
            className={`py-1 px-1 sm:py-3 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-base font-bold transition-all ${segmentBtnClass(
              key,
              activeSegment === key
            )}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] sm:text-xs text-gray-500 mb-1 sm:mb-3 leading-tight">{segmentTitle(activeSegment)}</p>

      <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-2 sm:mb-4">
        <button
          type="button"
          onClick={() => switchMode('prefecture')}
          className={`py-1 px-1 sm:py-3 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-base font-bold transition-all ${modeBtnClass(
            viewMode === 'prefecture'
          )}`}
        >
          {t.pref}
        </button>
        <button
          type="button"
          onClick={() => switchMode('city')}
          className={`py-1 px-1 sm:py-3 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-base font-bold transition-all ${modeBtnClass(
            viewMode === 'city'
          )}`}
        >
          {t.city}
        </button>
        <button
          type="button"
          onClick={() => switchMode('town')}
          className={`py-1 px-1 sm:py-3 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-base font-bold transition-all ${modeBtnClass(
            viewMode === 'town'
          )}`}
        >
          {t.town}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">{t.loading}</div>
      ) : activeData.length === 0 ? (
        <div className="text-center py-12 text-gray-500 rounded-xl border-2 border-gray-200">
          <MapPin size={48} className="mx-auto mb-4 text-gray-300" />
          <p>{t.noData}</p>
          <p className="text-sm mt-2">{t.noDataHint}</p>
        </div>
      ) : (
        <div className="panel-scrollbar max-h-[44rem] overflow-y-auto pr-1 space-y-1 max-sm:space-y-0.5">
          {activeData.map((item, index) => {
            const percentage = (item.customerCount / activeMaxCount) * 100;
            const isTop3 = index < 3;
            const rankClass =
              index === 0
                ? 'text-yellow-600'
                : index === 1
                  ? 'text-gray-500'
                  : index === 2
                    ? 'text-orange-600'
                    : 'text-gray-600';
            return (
              <button
                key={`${activeSegment}:${item.region}`}
                type="button"
                onClick={() => setSelectedRegion({ segment: activeSegment, region: item.region })}
                className={`w-full text-left rounded-lg border px-2 py-1.5 max-sm:px-1.5 max-sm:py-1 transition-all hover:border-green-400 ${
                  isTop3
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 sm:gap-2">
                  <div className="min-w-0 flex-1 text-xs sm:text-sm font-bold text-gray-900 truncate">
                    <span className={`${rankClass} mr-0.5`}>{index + 1}.</span>
                    <MapPin size={12} className="text-green-600 shrink-0 inline sm:hidden mr-0.5" />
                    {item.region}
                  </div>
                  <div className="shrink-0 flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs whitespace-nowrap">
                    <span className="font-bold text-blue-700">{item.customerCount}{t.people}</span>
                    <span className="text-gray-600">来院{item.visitCount}{t.visitsUnit}</span>
                    <span className="font-bold text-green-700">
                      {t.yen}
                      {item.totalRevenue.toLocaleString()}
                    </span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0 hidden sm:block" />
                  </div>
                </div>

                <div className="relative h-1 sm:h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5 sm:mt-1">
                  <div
                    className="absolute h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedRegion !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-800">{t.modalTitle}</h3>
                <p className="text-sm text-gray-600">
                  {segmentTitle(selectedRegion.segment)} / {viewModeLabel(viewMode)}: {selectedRegion.region}（{drilldownCustomers.length}
                  {t.people}）
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportDrilldown}
                  disabled={drilldownCustomers.length === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  <Download size={16} />
                  {t.exportRegion}
                </button>
                <ModalCloseButton onClick={() => setSelectedRegion(null)} />
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-left text-gray-600">
                    <th className="py-2 pr-3 font-bold">{t.colNo}</th>
                    <th className="py-2 pr-3 font-bold">{t.colName}</th>
                    <th className="py-2 pr-3 font-bold">{t.colPref}</th>
                    <th className="py-2 pr-3 font-bold">{t.colCity}</th>
                    <th className="py-2 pr-3 font-bold">{t.colTown}</th>
                    <th className="py-2 font-bold">{t.colEdit}</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownCustomers.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-3 font-mono text-gray-800">{c.customer_number ?? ''}</td>
                      <td className="py-2 pr-3 text-gray-900">{c.name ?? ''}</td>
                      <td className="py-2 pr-3 text-gray-700">{regionLabel(c.prefecture)}</td>
                      <td className="py-2 pr-3 text-gray-700">{regionLabel(c.city)}</td>
                      <td className="py-2 pr-3 text-gray-700">{regionLabel(c.town)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setEditCustomer(c)}
                          className="p-2 rounded-lg border border-gray-300 hover:bg-green-50 hover:border-green-400"
                          aria-label={t.colEdit}
                        >
                          <Pencil size={16} className="text-green-700" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <CustomerRosterEditModal
        customer={editCustomer}
        open={editCustomer !== null}
        onClose={() => setEditCustomer(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
