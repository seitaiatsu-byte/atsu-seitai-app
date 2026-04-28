import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Download, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
import { getCustomerBirthDate } from '../lib/customerBirthday';
import {
  formatTableCell,
  getAgeYearsFromCustomer,
  getChiefComplaint1Display,
  getChiefTripletWithVisitMenu,
  getInflowLineForChart,
  getPhoneWithFallbackMeta,
} from '../lib/customerDisplayFields';
import { getKanaForRoster, getMemoForRoster, type CustomerRowRecord } from '../lib/customerRosterFieldResolve';
import { fetchBusinessRules } from '../lib/businessRules';
import {
  filterQualifyingVisits,
  firstQualifyingVisitDate,
  qualifyingVisitRepeatCount,
} from '../lib/repeatMetrics';
import { buildIdToNameMap, formatPaymentDetailLabel, formatPaymentMethodLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import VisitRecordDateAccordion from './VisitRecordDateAccordion';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';
import { clinicNameToShortLabel } from '../lib/clinic';

type Customer = Database['public']['Tables']['customers']['Row'];
type VisitRow = Database['public']['Tables']['visit_records']['Row'];
type ProductRow = Database['public']['Tables']['product_sales']['Row'];
type SubRow = Database['public']['Tables']['subscription_records']['Row'];

type TimelineItem = {
  id: string;
  kind: 'visit' | 'product' | 'subscription';
  date: string;
  label: string;
  sublabel: string;
  amount: number;
};

type MediaEntry = {
  visitId: string;
  visitDate: string;
  url: string;
};

type ChartSummaryPanel = 'maintenance' | 'product' | 'subscription' | null;

function formatDateJaYmd(s: string | null | undefined): string {
  const t = (s || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '—';
  return new Date(`${t}T12:00:00`).toLocaleDateString('ja-JP');
}

export default function IndividualChart() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [paymentMethodNames, setPaymentMethodNames] = useState<Record<string, string>>({});
  const [paymentDetailNames, setPaymentDetailNames] = useState<Record<string, string>>({});
  const [methodNameMap, setMethodNameMap] = useState<Record<string, string>>({});
  const [detailNameMap, setDetailNameMap] = useState<Record<string, string>>({});
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [referral1FromMaster, setReferral1FromMaster] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState<ChartSummaryPanel>(null);

  useEffect(() => {
    fetchBusinessRules().then((r) => setExcludeKeywords(r.excludeKeywords));
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setReferral1FromMaster(null);
      return;
    }
    const id = selectedCustomer.referral_source_id;
    if (!id) {
      setReferral1FromMaster(null);
      return;
    }
    let cancel = false;
    void (async () => {
      const { data } = await supabase
        .from('referral_source_master')
        .select('name')
        .eq('id', id)
        .maybeSingle();
      if (!cancel) setReferral1FromMaster((data as { name: string } | null)?.name ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCustomer?.id, selectedCustomer?.referral_source_id]);

  /** 一覧のキャッシュ行では列が古い/欠けることがあるため、カルテ表示前に API から最新1行を取得。 */
  useEffect(() => {
    const id = selectedCustomer?.id;
    if (!id) return;
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
      if (cancel) return;
      if (error) {
        if (import.meta.env.DEV) {
          console.error(
            '[個人カルテ] 顧客1件の再取得に失敗（表示は検索時の行のまま）:',
            error.message,
            error
          );
        }
        return;
      }
      if (!data) return;
      setSelectedCustomer((prev) => (prev && prev.id === id ? (data as Customer) : prev));
    })();
    return () => {
      cancel = true;
    };
  }, [selectedCustomer?.id]);

  const loadCustomerData = useCallback(async () => {
    if (!selectedCustomer) return;
    const [{ data: v }, { data: p }, { data: s }, { data: pm }, { data: pd }] = await Promise.all([
      supabase.from('visit_records').select('*').eq('customer_id', selectedCustomer.id).order('visit_date', { ascending: false }),
      supabase.from('product_sales').select('*').eq('customer_id', selectedCustomer.id).order('sale_date', { ascending: false }),
      supabase.from('subscription_records').select('*').eq('customer_id', selectedCustomer.id).order('start_date', { ascending: false }),
      supabase.from('payment_method_master').select('id, name'),
      supabase.from('payment_detail_master').select('id, name'),
    ]);
    setVisits(v || []);
    setProducts(p || []);
    setSubs(s || []);
    const merged = mergeIdNameMaps(pm as { id: string; name: string }[], pd as { id: string; name: string }[]);
    setPaymentMethodNames(merged);
    setPaymentDetailNames(merged);
    setMethodNameMap(buildIdToNameMap(pm as { id: string; name: string }[]));
    setDetailNameMap(buildIdToNameMap(pd as { id: string; name: string }[]));
  }, [selectedCustomer]);

  useEffect(() => {
    void loadCustomerData();
  }, [loadCustomerData]);

  useEffect(() => {
    setSummaryOpen(null);
  }, [selectedCustomer?.id]);

  useEffect(() => {
    const onRecordsUpdated = () => {
      void loadCustomerData();
    };
    window.addEventListener('records-updated', onRecordsUpdated);
    return () => window.removeEventListener('records-updated', onRecordsUpdated);
  }, [loadCustomerData]);

  const totalLtv = useMemo(() => {
    const vt = visits.reduce((a, v) => a + Number(v.amount || 0), 0);
    const pt = products.reduce((a, p) => a + Number(p.amount || 0), 0);
    const st = subs.reduce((a, s) => a + Number(s.amount || 0), 0);
    return vt + pt + st;
  }, [visits, products, subs]);

  const timeline: TimelineItem[] = useMemo(() => {
    const rows: TimelineItem[] = [];
    visits.forEach((v) => {
      const pm = formatPaymentMethodLabel(v.payment_method, paymentMethodNames);
      const pd = formatPaymentDetailLabel(v.payment_detail_id, paymentDetailNames, v.import_kind_text, v.memo);
      rows.push({
        id: `v-${v.id}`,
        kind: 'visit',
        date: v.visit_date,
        label: '来院',
        sublabel: [v.menu_name, pd !== '-' ? pd : null, pm !== '-' ? pm : null].filter(Boolean).join(' / '),
        amount: Number(v.amount || 0),
      });
    });
    products.forEach((p) => {
      const pm = formatPaymentMethodLabel(p.payment_method, paymentMethodNames);
      const qty = Number(p.quantity || 0);
      const amount = Number(p.amount || 0);
      const unit = qty > 0 ? Math.round(amount / qty) : 0;
      rows.push({
        id: `p-${p.id}`,
        kind: 'product',
        date: p.sale_date,
        label: '物販',
        sublabel: `${p.product_name || '商品'} ×${p.quantity} @¥${unit.toLocaleString()} / ${pm}`,
        amount,
      });
    });
    subs.forEach((s) => {
      const pm = formatPaymentMethodLabel(s.payment_method, paymentMethodNames);
      rows.push({
        id: `s-${s.id}`,
        kind: 'subscription',
        date: s.start_date,
        label: 'サブスク',
        sublabel: `${s.subscription_name || 'プラン'} / ${pm}`,
        amount: Number(s.amount || 0),
      });
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [visits, products, subs, paymentMethodNames, paymentDetailNames]);

  const productSummary = useMemo(() => {
    const lineCount = products.length;
    const qtyTotal = products.reduce((s, p) => s + Number(p.quantity || 0), 0);
    const amountTotal = products.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { lineCount, qtyTotal, amountTotal };
  }, [products]);

  const subscriptionSummary = useMemo(() => {
    const count = subs.length;
    const amountTotal = subs.reduce((s, x) => s + Number(x.amount || 0), 0);
    return { count, amountTotal };
  }, [subs]);

  const maintenanceSummary = useMemo(
    () => visits.reduce((s, v) => s + Number(v.maintenance_cost || 0), 0),
    [visits]
  );

  const visitsWithMaintenance = useMemo(
    () =>
      [...visits]
        .filter((v) => Number(v.maintenance_cost || 0) !== 0)
        .sort((a, b) => b.visit_date.localeCompare(a.visit_date)),
    [visits]
  );

  const allMediaEntries = useMemo<MediaEntry[]>(() => {
    const entries: MediaEntry[] = [];
    visits.forEach((v) => {
      (v.media_urls || []).forEach((u) => {
        entries.push({
          visitId: v.id,
          visitDate: v.visit_date,
          url: u,
        });
      });
    });
    return entries.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  }, [visits]);

  const removeMediaUrl = async (visitId: string, targetUrl: string) => {
    if (!window.confirm('この画像を削除してもよろしいですか？')) return;
    const row = visits.find((v) => v.id === visitId);
    if (!row) return;
    const nextUrls = (row.media_urls || []).filter((u) => u !== targetUrl);
    const { error } = await supabase.from('visit_records').update({ media_urls: nextUrls }).eq('id', visitId);
    if (error) {
      alert('画像削除に失敗しました');
      return;
    }
    setVisits((prev) => prev.map((v) => (v.id === visitId ? { ...v, media_urls: nextUrls } : v)));
  };

  const downloadMedia = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      const filename = url.split('/').pop() || 'media';
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  const visitLite = useMemo(
    () => visits.map((v) => ({ visit_date: v.visit_date, menu_name: v.menu_name })),
    [visits]
  );

  const firstQDate = firstQualifyingVisitDate(visitLite, excludeKeywords);
  const repeatVisitCount = qualifyingVisitRepeatCount(visitLite, excludeKeywords);
  const firstDayProductCount = useMemo(() => {
    if (!firstQDate) return 0;
    const day = firstQDate.slice(0, 10);
    return products.filter((p) => p.sale_date.slice(0, 10) === day).length;
  }, [firstQDate, products]);

  const qualifyingCount = filterQualifyingVisits(visitLite, excludeKeywords).length;

  const birth = selectedCustomer ? getCustomerBirthDate(selectedCustomer) : null;
  const age =
    selectedCustomer == null
      ? null
      : getAgeYearsFromCustomer(selectedCustomer);

  const inflowFromVisits = useMemo(
    () =>
      selectedCustomer
        ? getInflowLineForChart(selectedCustomer, referral1FromMaster, visits)
        : { line: null, note: null as 'customer' | 'master' | 'visit' | null },
    [selectedCustomer, referral1FromMaster, visits]
  );

  const phoneForChart = useMemo(
    () =>
      selectedCustomer
        ? getPhoneWithFallbackMeta(selectedCustomer, visits.map((v) => v.memo))
        : { value: null as string | null, fromRoster: true },
    [selectedCustomer, visits]
  );

  const chiefLines = useMemo(
    () =>
      selectedCustomer
        ? getChiefTripletWithVisitMenu(selectedCustomer, visits)
        : [null, null, null],
    [selectedCustomer, visits]
  );

  const rosterMemo = useMemo(
    () => (selectedCustomer ? getMemoForRoster(selectedCustomer as CustomerRowRecord) : null),
    [selectedCustomer]
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">個人カルテ</h2>

      {!selectedCustomer ? (
        <CustomerSearchPanel
          accent="blue"
          selectedCustomer={null}
          onSelect={(c) => setSelectedCustomer(c)}
          onClearSelection={() => {}}
        />
      ) : (
        <div>
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl font-bold border bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X size={18} />
              別の顧客
            </button>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-xl p-6 mb-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-600 font-bold">顧客番号</div>
                <div className="text-xl font-bold text-gray-900">{selectedCustomer.customer_number}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{selectedCustomer.name}</div>
                <div className="text-gray-600">
                  {getKanaForRoster(selectedCustomer as CustomerRowRecord) ?? '—'}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-bold text-pink-700">総LTV</div>
                <div className="text-3xl font-bold text-pink-900">¥{Math.round(totalLtv).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-gray-600 font-bold">性別</div>
                <div className="font-bold">{selectedCustomer.gender || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">年齢</div>
                <div className="font-bold">{age != null ? `${age}歳` : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">生年月日</div>
                <div className="font-bold">
                  {birth ? new Date(birth).toLocaleDateString('ja-JP') : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">電話</div>
                <div className="font-bold">
                  {phoneForChart.value ?? '—'}
                  {phoneForChart.value && !phoneForChart.fromRoster && (
                    <div className="text-[10px] text-amber-700 font-normal mt-0.5">
                      ※ 名簿の電話欄に値が取れないため、メモ・住所・来院メモから抽出しています
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-600 font-bold">住所</div>
                <div className="font-bold">
                  {[selectedCustomer.prefecture, selectedCustomer.city, selectedCustomer.town].filter(Boolean).join(' ') || '-'}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-600 font-bold">流入経路</div>
                <div className="font-bold">
                  {inflowFromVisits.line ?? '—'}
                  {inflowFromVisits.note === 'visit' && (
                    <div className="text-[10px] text-amber-700 font-normal mt-0.5">
                      ※ 顧客の「流入」が未登録のため、直近の来院取込（種類列）を表示しています
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">主訴1</div>
                <div className="font-bold">
                  {formatTableCell(chiefLines[0], '—')}
                  {chiefLines[0] && !getChiefComplaint1Display(selectedCustomer) && (
                    <div className="text-[10px] text-amber-700 font-normal mt-0.5">
                      ※ 顧客の主訴欄が空のため、直近来院の実施メニュー名を補完
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">主訴2</div>
                <div className="font-bold">{formatTableCell(chiefLines[1], '—')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">主訴3</div>
                <div className="font-bold">{formatTableCell(chiefLines[2], '—')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">ポイント</div>
                <div className="font-bold text-blue-600">{selectedCustomer.points ?? 0} pt</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 font-bold">院</div>
                <div className="font-bold">
                  <ClinicNameFromCustomer customer={selectedCustomer} emptyLabel="—" />
                </div>
              </div>
            </div>

            {rosterMemo && (
              <div className="rounded-lg p-3 bg-white/90 border border-gray-200 text-sm">
                <div className="text-xs text-gray-600 font-bold mb-1">メモ</div>
                <div className="text-gray-800 whitespace-pre-wrap break-words">{rosterMemo}</div>
              </div>
            )}

            <div className="bg-white/80 rounded-lg p-4 border border-blue-200">
              <div className="text-sm font-bold text-gray-800 mb-2">リピート・来院（設定連動）</div>
              <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                <li>対象来院: {qualifyingCount}回</li>
                <li>リピート回数: {repeatVisitCount}回</li>
                <li>初診日: {firstQDate ? new Date(firstQDate).toLocaleDateString('ja-JP') : '—'}</li>
                <li>初診当日物販: {firstDayProductCount}件</li>
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 underline decoration-blue-200">全履歴タイムライン</h3>
            <div className="border-2 border-gray-100 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto bg-gray-50/30">
              {timeline.length === 0 ? (
                <div className="p-8 text-center text-gray-400">履歴がありません</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {timeline.map((row) => (
                    <li key={row.id} className="px-4 py-3 hover:bg-white transition-colors">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            row.kind === 'visit' ? 'bg-blue-100 text-blue-700' : 
                            row.kind === 'product' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {row.label}
                          </span>
                          <span className="ml-2 font-bold text-gray-800">
                            {new Date(row.date).toLocaleDateString('ja-JP')}
                          </span>
                          <div className="text-xs text-gray-500 mt-1">{row.sublabel}</div>
                        </div>
                        <div className="font-bold text-gray-900">¥{Math.round(row.amount).toLocaleString()}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-bold text-gray-700 mb-1 underline decoration-blue-200">来院記録（日付別に展開 / 全項目表示）</h3>
            <p className="text-xs text-slate-500 mb-3">同じ日に複数来院がある場合は、日付見出しの下に並びます。</p>
            <VisitRecordDateAccordion
              visits={visits}
              customer={
                selectedCustomer
                  ? { customer_number: selectedCustomer.customer_number, name: selectedCustomer.name }
                  : null
              }
              methodIdToName={methodNameMap}
              detailIdToName={detailNameMap}
              defaultExpandFirst
            />
          </div>

          {/* 来院画像一覧（あつさん指示：日付付きで上下に並べる） */}
          <div className="mt-8">
            <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <ImageIcon size={18} className="text-blue-500" /> 
              来院画像一覧（日付順）
            </h3>
            {allMediaEntries.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
                画像はまだありません
              </div>
            ) : (
              <div className="flex flex-col gap-10">
                {allMediaEntries.map((m) => (
                  <div key={`${m.visitId}-${m.url}`} className="space-y-3">
                    {/* 日付ラベル */}
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-800 text-white px-4 py-1 rounded-full text-xs font-bold shadow-sm">
                        📅 {new Date(m.visitDate).toLocaleDateString('ja-JP')} 来院画像
                      </span>
                    </div>
                    
                    {/* 画像本体：大きく表示 */}
                    <div className="group relative rounded-2xl border-4 border-white shadow-xl bg-black overflow-hidden">
                      <img 
                        src={m.url} 
                        alt="visit-media" 
                        className="w-full h-auto block mx-auto hover:opacity-95 transition-opacity" 
                      />
                      
                      {/* 操作ボタン */}
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 p-2 rounded-xl backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => window.open(m.url, '_blank')}
                          className="p-2 text-white hover:bg-white/20 rounded-lg"
                          title="全画面"
                        >
                          <ImageIcon size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadMedia(m.url)}
                          className="p-2 text-blue-300 hover:bg-white/20 rounded-lg"
                          title="ダウンロード"
                        >
                          <Download size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMediaUrl(m.visitId, m.url)}
                          className="p-2 text-red-400 hover:bg-white/20 rounded-lg"
                          title="削除"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3 pt-6 border-t border-gray-100">
            {/* 維持費用 */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryOpen((p) => (p === 'maintenance' ? null : 'maintenance'))}
                className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-amber-100/60 transition-colors min-h-[4.5rem]"
              >
                <div>
                  <div className="text-[10px] font-bold text-amber-600">維持費用 合計（タップで内訳）</div>
                  <div className="text-2xl font-bold text-amber-900">¥{Math.round(maintenanceSummary).toLocaleString()}</div>
                </div>
                {summaryOpen === 'maintenance' ? (
                  <ChevronDown className="shrink-0 text-amber-800 mt-1" size={22} />
                ) : (
                  <ChevronRight className="shrink-0 text-amber-800 mt-1" size={22} />
                )}
              </button>
              {summaryOpen === 'maintenance' && (
                <div className="border-t border-amber-200 bg-white/90 px-3 py-2 max-h-80 overflow-y-auto text-xs text-amber-950">
                  {visitsWithMaintenance.length === 0 ? (
                    <p className="text-amber-800/90 py-2">維持費が記録された来院（0円以外）はありません。</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {visitsWithMaintenance.map((v) => {
                        const pd = formatPaymentDetailLabel(
                          v.payment_detail_id,
                          paymentDetailNames,
                          v.import_kind_text,
                          v.memo
                        );
                        const pm = formatPaymentMethodLabel(v.payment_method, paymentMethodNames);
                        return (
                          <li key={v.id} className="border-b border-amber-100 pb-2 last:border-0 last:pb-0">
                            <div className="font-bold text-amber-900">{formatDateJaYmd(v.visit_date)} 来院</div>
                            <div className="mt-1 space-y-0.5 text-[11px] text-amber-950/95">
                              <div>
                                維持費: ¥{Math.round(Number(v.maintenance_cost || 0)).toLocaleString()}{' '}
                                <span className="text-amber-700/90">
                                  ／ 施術売上: ¥{Math.round(Number(v.amount || 0)).toLocaleString()}
                                </span>
                              </div>
                              {v.menu_name && (
                                <div>メニュー: {v.menu_name}</div>
                              )}
                              <div>支払: {pm !== '-' ? pm : '—'}</div>
                              {pd !== '-' && <div>種類: {pd}</div>}
                              {v.clinic_name && (
                                <div>院: {clinicNameToShortLabel(v.clinic_name)}</div>
                              )}
                              {v.staff_name && <div>担当: {v.staff_name}</div>}
                              {v.memo && (v.memo || '').trim() !== '' && (
                                <div className="whitespace-pre-wrap break-words text-amber-900/85">メモ: {v.memo}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* 物販 */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryOpen((p) => (p === 'product' ? null : 'product'))}
                className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-orange-100/60 transition-colors min-h-[4.5rem]"
              >
                <div>
                  <div className="text-[10px] font-bold text-orange-600">物販集計（タップで内訳）</div>
                  <div className="text-xl font-bold text-orange-900 mt-0.5">
                    ¥{Math.round(productSummary.amountTotal).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-orange-800 mt-1">
                    {productSummary.qtyTotal}個 / {productSummary.lineCount}件
                  </div>
                </div>
                {summaryOpen === 'product' ? (
                  <ChevronDown className="shrink-0 text-orange-800 mt-1" size={22} />
                ) : (
                  <ChevronRight className="shrink-0 text-orange-800 mt-1" size={22} />
                )}
              </button>
              {summaryOpen === 'product' && (
                <div className="border-t border-orange-200 bg-white/90 px-3 py-2 max-h-80 overflow-y-auto text-xs text-orange-950">
                  {products.length === 0 ? (
                    <p className="text-orange-800/90 py-2">物販の登録はありません。</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {products.map((p) => {
                        const pm = formatPaymentMethodLabel(p.payment_method, paymentMethodNames);
                        return (
                          <li key={p.id} className="border-b border-orange-100 pb-2 last:border-0 last:pb-0">
                            <div className="font-bold text-orange-900">{formatDateJaYmd(p.sale_date)}</div>
                            <div className="mt-1 space-y-0.5 text-[11px] text-orange-950/95">
                              <div>
                                {p.product_name || '商品名未登録'} ×{p.quantity ?? 0} ＝{' '}
                                <span className="font-bold">¥{Math.round(Number(p.amount || 0)).toLocaleString()}</span>
                              </div>
                              <div>支払: {pm !== '-' ? pm : '—'}</div>
                              {p.clinic_name && <div>院: {clinicNameToShortLabel(p.clinic_name)}</div>}
                              {p.staff_name && <div>担当: {p.staff_name}</div>}
                              {p.memo && (p.memo || '').trim() !== '' && (
                                <div className="whitespace-pre-wrap break-words text-orange-900/85">メモ: {p.memo}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* サブスク */}
            <div className="rounded-xl border border-purple-200 bg-purple-50 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryOpen((p) => (p === 'subscription' ? null : 'subscription'))}
                className="w-full p-4 text-left flex items-start justify-between gap-2 hover:bg-purple-100/60 transition-colors min-h-[4.5rem]"
              >
                <div>
                  <div className="text-[10px] font-bold text-purple-600">サブスク集計（タップで内訳）</div>
                  <div className="text-xl font-bold text-purple-900 mt-0.5">
                    ¥{Math.round(subscriptionSummary.amountTotal).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-purple-800 mt-1">{subscriptionSummary.count}件</div>
                </div>
                {summaryOpen === 'subscription' ? (
                  <ChevronDown className="shrink-0 text-purple-800 mt-1" size={22} />
                ) : (
                  <ChevronRight className="shrink-0 text-purple-800 mt-1" size={22} />
                )}
              </button>
              {summaryOpen === 'subscription' && (
                <div className="border-t border-purple-200 bg-white/90 px-3 py-2 max-h-80 overflow-y-auto text-xs text-purple-950">
                  {subs.length === 0 ? (
                    <p className="text-purple-800/90 py-2">サブスクの登録はありません。</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {subs.map((s) => {
                        const pm = formatPaymentMethodLabel(s.payment_method, paymentMethodNames);
                        return (
                          <li key={s.id} className="border-b border-purple-100 pb-2 last:border-0 last:pb-0">
                            <div className="font-bold text-purple-900">開始 {formatDateJaYmd(s.start_date)}</div>
                            <div className="mt-1 space-y-0.5 text-[11px] text-purple-950/95">
                              <div>
                                {s.subscription_name || 'プラン名未登録'}{' '}
                                <span className="font-bold">¥{Math.round(Number(s.amount || 0)).toLocaleString()}</span>
                              </div>
                              <div>支払: {pm !== '-' ? pm : '—'}</div>
                              {s.clinic_name && <div>院: {clinicNameToShortLabel(s.clinic_name)}</div>}
                              {s.staff_name && <div>担当: {s.staff_name}</div>}
                              {s.memo && (s.memo || '').trim() !== '' && (
                                <div className="whitespace-pre-wrap break-words text-purple-900/85">メモ: {s.memo}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}