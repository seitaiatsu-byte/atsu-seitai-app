import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Upload, Edit2, Trash2, History, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CustomerSearchPanel from './CustomerSearchPanel';
import { CLINIC_OPTIONS, customerNumberHistoryRowClass, type ClinicFullName } from '../lib/clinic';
import { isPlaceholderCustomerNumber } from '../lib/customerNumber';
import { buildIdToNameMap, formatPaymentDetailLabel, formatPaymentMethodLabel } from '../lib/paymentDisplay';
import {
  legacyImportKindLabel,
  resolvePaymentDetailIdFromKindLabel,
  stripKindPrefixFromMemo,
} from '../lib/visitRecordKindCompat';
import { formatVisitMonthDay, getTodayLocalYmd } from '../lib/visitDateParse';
import { recalcBeEquivalentCountsForCustomers } from '../lib/beEquivalentRecalc';
import { blockEnterFormSubmit, swallowFormSubmit } from '../lib/formSubmitGuard';
import { ensureJapaneseImeForInput } from '../lib/useJapaneseTextInputs';
import {
  formatCustomerNumberForMessage,
  hasVisitOnDate,
  validateExplicitAmount,
} from '../lib/registrationValidation';
import { markMatchingReservationVisited, markReservationVisited } from '../lib/appointmentReservations';
import type { CustomerRow } from './CustomerSearchPanel';

function normalizeSearchText(raw: unknown): string {
  const s = String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
  return s.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function parseCustomerNumber(raw: unknown): number {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatCompactDate(raw: unknown): string {
  const s = String(raw || '').slice(0, 10);
  if (!s) return '—';
  return s.replace(/-/g, '/');
}

function formatYen(raw: unknown): string {
  const n = Number(raw || 0);
  return `¥${Number.isFinite(n) ? Math.round(n).toLocaleString() : '0'}`;
}

function buildLegacyCustomerWarning(customerNumber: unknown): string | null {
  const n = parseCustomerNumber(customerNumber);
  if (!Number.isFinite(n)) return null;

  const notes: string[] = [];
  if (n >= 5000 && n <= 5999) {
    notes.push('高槻院の 5000〜5999 番台は古い顧客番号の可能性');
  }
  if (n >= 4000 && n <= 4999) {
    notes.push('川西院の 4000〜4999 番台は FE 扱い・終了顧客の可能性');
  }
  if (notes.length === 0) return null;

  return [
    `顧客番号 ${n} は注意対象です。`,
    ...notes.map((s) => `・${s}`),
    '',
    '古い番号やFE扱いの人の可能性がありますが、そのまま登録しますか？',
  ].join('\n');
}

function isNumericOnlyFieldTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const inputMode = (el.getAttribute('inputmode') || '').toLowerCase();
  return inputMode === 'numeric' || inputMode === 'decimal' || el.getAttribute('data-ime') === 'off';
}

export default function VisitForm({
  initialCustomer = null,
  initialVisitDate,
  linkedReservationId = null,
  onVisitSeedConsumed,
}: {
  initialCustomer?: CustomerRow | null;
  initialVisitDate?: string;
  linkedReservationId?: string | null;
  onVisitSeedConsumed?: () => void;
} = {}) {
  const [selectedCustomer, setSelectedCustomer] = useState<any>(initialCustomer);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [menus, setMenus] = useState<any[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [recentRecords, setRecentRecords] = useState<any[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(initialVisitDate || getTodayLocalYmd);
  const [clinicName, setClinicName] = useState<ClinicFullName>('高槻あつ整体院');
  const [amount, setAmount] = useState('');
  const [staffId, setStaffId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState('');
  const [selectedMenu, setSelectedMenu] = useState('');
  const [pointsUsed, setPointsUsed] = useState('0');
  const [importTicketRaw, setImportTicketRaw] = useState('');
  const [importCsvVisitCount, setImportCsvVisitCount] = useState('');
  const [beEquiv, setBeEquiv] = useState('');
  const [menuNameFree, setMenuNameFree] = useState('');
  const [maintenanceCost, setMaintenanceCost] = useState('0');
  const [memo, setMemo] = useState('');
  const [importKindLegacy, setImportKindLegacy] = useState<string | null>(null);

  const [methodNameMap, setMethodNameMap] = useState<Record<string, string>>({});
  const [detailNameMap, setDetailNameMap] = useState<Record<string, string>>({});
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [currentMediaUrls, setCurrentMediaUrls] = useState<string[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');
  const [inputPanelOpen, setInputPanelOpen] = useState(Boolean(initialCustomer));
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [openHistoryDates, setOpenHistoryDates] = useState<Set<string>>(new Set());
  const [pendingReservationId, setPendingReservationId] = useState<string | null>(linkedReservationId);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [submitFlash, setSubmitFlash] = useState('');

  useEffect(() => {
    if (!initialCustomer) return;
    setSelectedCustomer(initialCustomer);
    setInputPanelOpen(true);
    if (initialVisitDate) setVisitDate(initialVisitDate);
    if (linkedReservationId) setPendingReservationId(linkedReservationId);
    onVisitSeedConsumed?.();
  }, [initialCustomer, initialVisitDate, linkedReservationId, onVisitSeedConsumed]);
  const legacyNumberWarning = useMemo(
    () => buildLegacyCustomerWarning(selectedCustomer?.customer_number),
    [selectedCustomer?.customer_number]
  );
  const placeholderCustomerWarning = useMemo(() => {
    if (!isPlaceholderCustomerNumber(selectedCustomer?.customer_number)) return null;
    return '仮予約用（10000・新規仮）です。来院記録は正式番号の患者で登録してください。カレンダーでは仮予約を削除し、正式患者の予約から来院入力してください。';
  }, [selectedCustomer?.customer_number]);

  useEffect(() => {
    if (selectedCustomer?.customer_number && !editingId) {
      if (isPlaceholderCustomerNumber(selectedCustomer.customer_number)) return;
      const num = parseInt(selectedCustomer.customer_number, 10);
      setClinicName(num >= 5000 ? '高槻あつ整体院' : '川西あつ整体院');
    }
  }, [selectedCustomer, editingId]);

  const loadMasters = useCallback(async () => {
    const [{ data: pm }, { data: m }, { data: pd }, { data: s }, { data: pma }, { data: pda }] = await Promise.all([
      supabase.from('payment_method_master').select('*').eq('is_active', true).order('display_order'),
      supabase.from('menu_master').select('*').eq('is_active', true).order('display_order'),
      supabase.from('payment_detail_master').select('*').eq('is_active', true).order('display_order'),
      supabase.from('staff_master').select('*').eq('is_active', true).order('display_order'),
      supabase.from('payment_method_master').select('id, name'),
      supabase.from('payment_detail_master').select('id, name'),
    ]);
    if (pm?.length) {
      setPaymentMethods(pm);
    }
    if (m) setMenus(m);
    if (pd) setPaymentDetails(pd);
    if (s) setStaffList(s);
    if (pma) setMethodNameMap(buildIdToNameMap(pma as { id: string; name: string }[]));
    if (pda) setDetailNameMap(buildIdToNameMap(pda as { id: string; name: string }[]));
  }, []);

  const loadRecentRecords = useCallback(async () => {
    const PAGE = 500;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('visit_records')
        .select('*, customers(id, name, customer_number, name_kana, kana)')
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data?.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += data.length;
    }
    setRecentRecords(all);
  }, []);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    if (paymentMethods.length && !editingId) {
      setPaymentMethodId(paymentMethods[0]!.id);
    }
  }, [paymentMethods, editingId]);

  useEffect(() => {
    void loadRecentRecords();
  }, [loadRecentRecords]);

  useEffect(() => {
    const h = () => {
      void loadMasters();
      void loadRecentRecords();
    };
    window.addEventListener('records-updated', h);
    return () => window.removeEventListener('records-updated', h);
  }, [loadMasters, loadRecentRecords]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (picked?.length) {
      const files = Array.from(picked);
      setSelectedFiles((prev) => [...prev, ...files]);
      setPreviewUrls((prev) => [...prev, ...files.map((file) => URL.createObjectURL(file))]);
    }
    e.target.value = '';
  };

  const removeNewPreviewAt = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const openPhotoPicker = () => {
    photoInputRef.current?.click();
  };

  const clearVisitInputFields = () => {
    setAmount('');
    setMemo('');
    setStaffId('');
    setSelectedMenu('');
    setSelectedPaymentDetail('');
    setPointsUsed('0');
    setImportTicketRaw('');
    setImportCsvVisitCount('');
    setBeEquiv('');
    setMenuNameFree('');
    setMaintenanceCost('0');
    setSelectedFiles([]);
    setPreviewUrls([]);
    setCurrentMediaUrls([]);
    setImportKindLegacy(null);
    setDuplicateError('');
  };

  /** 入力欄を初期状態に戻す（顧客選択の有無は別途） */
  const resetVisitFormDefaults = () => {
    setEditingId(null);
    clearVisitInputFields();
    setVisitDate(getTodayLocalYmd());
    setClinicName('高槻あつ整体院');
    if (paymentMethods.length) setPaymentMethodId(paymentMethods[0]!.id);
    else setPaymentMethodId('');
  };

  /** 登録・修正保存後：フォームを隠し、検索だけ表示して次の患者へ */
  const prepareForNextVisitEntry = (options?: {
    flashMessage?: string;
    highlightHistoryDate?: string;
  }) => {
    resetVisitFormDefaults();
    setSelectedCustomer(null);
    setInputPanelOpen(true);
    setSubmitFlash(
      options?.flashMessage ?? '来院記録を登録しました。次の患者をふりがなで検索してください。'
    );
    setSearchFocusSignal((n) => n + 1);
    if (options?.highlightHistoryDate) {
      setHistoryPanelOpen(true);
      const d = options.highlightHistoryDate.slice(0, 10);
      if (d) setOpenHistoryDates((prev) => new Set(prev).add(d));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!submitFlash) return;
    const t = window.setTimeout(() => setSubmitFlash(''), 4000);
    return () => window.clearTimeout(t);
  }, [submitFlash]);

  const handleSubmit = async () => {
    setDuplicateError('');
    if (!selectedCustomer) return alert('顧客を選んでください');
    if (!editingId && isPlaceholderCustomerNumber(selectedCustomer.customer_number)) {
      alert(
        '仮予約用（10000・新規仮）では来院記録を登録できません。正式番号の患者を選んでください。'
      );
      return;
    }

    const amountError = validateExplicitAmount(amount);
    if (amountError) return alert(amountError);

    if (!editingId && (await hasVisitOnDate(selectedCustomer.id, visitDate))) {
      const cn = formatCustomerNumberForMessage(selectedCustomer.customer_number);
      setDuplicateError(
        `顧客番号 ${cn}・来院日 ${visitDate} の来院記録は既に登録されています。重複登録はできません。`
      );
      return;
    }

    if (!editingId) {
      const warning = buildLegacyCustomerWarning(selectedCustomer.customer_number);
      if (warning && !window.confirm(warning)) {
        return;
      }
    }

    setIsSubmitting(true);
    const amountValue = Number(amount.trim());

    try {
      const menuObj = menus.find((m) => m.id === selectedMenu);
      const staffObj = staffList.find((s) => s.id === staffId);
      const pu = Number(pointsUsed) || 0;
      const menuNameResolved = (menuObj?.name || menuNameFree.trim() || null) as string | null;
      const beNum = beEquiv.trim() ? parseInt(beEquiv.replace(/\D/g, ''), 10) : null;

      const cleanedMemo = stripKindPrefixFromMemo(memo) ?? (memo.trim() || null);

      const basePayload = {
        visit_date: visitDate,
        payment_method: paymentMethodId,
        payment_detail_id: selectedPaymentDetail || null,
        import_kind_text: null,
        amount: amountValue,
        memo: cleanedMemo,
        clinic_name: clinicName,
        staff_name: staffObj?.name || null,
        menu_id: selectedMenu || null,
        menu_name: menuNameResolved,
        points_used: pu,
        maintenance_cost: Number(maintenanceCost) || 0,
        import_customer_name: selectedCustomer.name,
        import_csv_visit_count: importCsvVisitCount.trim() || null,
        import_ticket_count_raw: importTicketRaw.trim() || (pu ? String(pu) : null),
        be_equivalent_count: beNum != null && Number.isFinite(beNum) ? beNum : null,
      };

      const { data: record, error: dbError } = editingId
        ? await supabase.from('visit_records').update(basePayload).eq('id', editingId).select()
        : await (async () => {
            const { data: mx } = await supabase
              .from('visit_records')
              .select('visit_number')
              .eq('customer_id', selectedCustomer.id)
              .order('visit_number', { ascending: false })
              .limit(1)
              .maybeSingle();
            const nextVn = (mx?.visit_number != null ? mx.visit_number : 0) + 1;
            const insertPayload = {
              customer_id: selectedCustomer.id,
              ...basePayload,
              visit_number: nextVn,
            };
            return supabase.from('visit_records').insert([insertPayload]).select();
          })();

      if (dbError) throw new Error(`DB登録失敗: ${dbError.message}`);

      // 2. 画像のアップロード（ここで失敗したらアラートを出す）
      const visitId = record[0].id;
      const uploadedUrls = [...currentMediaUrls];
      
      for (const file of selectedFiles) {
        const safeName = file.name.replace(/[^\w.\-()]/g, '_') || 'photo.jpg';
        const path = `${visitId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('visit-media').upload(path, file);
        
        if (upErr) {
          throw new Error(`画像アップロード失敗: ${upErr.message}\nストレージの設定を確認してください`);
        }

        const { data: pub } = supabase.storage.from('visit-media').getPublicUrl(path);
        uploadedUrls.push(pub.publicUrl);
      }

      // 3. 全画像URLをDBに書き込んで「完結」
      const { error: updateError } = await supabase.from('visit_records').update({ media_urls: uploadedUrls }).eq('id', visitId);
      if (updateError) throw new Error(`URL保存失敗: ${updateError.message}`);

      await recalcBeEquivalentCountsForCustomers([selectedCustomer.id]);

      if (!editingId) {
        if (pendingReservationId) {
          await markReservationVisited(pendingReservationId, visitId);
          setPendingReservationId(null);
        } else {
          await markMatchingReservationVisited(selectedCustomer.id, visitDate, visitId);
        }
      }

      const wasEdit = Boolean(editingId);
      if (wasEdit) {
        alert('内容と画像を修正しました');
        prepareForNextVisitEntry({
          flashMessage: '修正を保存しました。次の患者をふりがなで検索してください。',
          highlightHistoryDate: visitDate,
        });
      } else {
        prepareForNextVisitEntry();
      }
      loadRecentRecords();
      window.dispatchEvent(new Event('records-updated'));

    } catch (err: any) {
      alert(`【エラー発生】\n${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || '').trim());

  const startEdit = (r: any) => {
    setInputPanelOpen(true);
    setHistoryPanelOpen(true);
    const d = String(r.visit_date || '').slice(0, 10);
    if (d) setOpenHistoryDates((prev) => new Set(prev).add(d));
    setEditingId(r.id);
    setSelectedCustomer(r.customers);
    setVisitDate((r.visit_date || '').slice(0, 10));
    setClinicName((r.clinic_name as ClinicFullName) || '高槻あつ整体院');
    setAmount(r.amount != null ? String(r.amount) : '0');
    setStaffId(staffList.find((s) => s.name === r.staff_name)?.id || '');
    const rawPm = r.payment_method;
    if (isUuid(rawPm)) {
      setPaymentMethodId(rawPm);
    } else {
      const hit = paymentMethods.find((m) => m.name === String(rawPm || ''));
      setPaymentMethodId(hit?.id || paymentMethods[0]?.id || '');
    }
    const legacyKind = legacyImportKindLabel(r);
    setImportKindLegacy(legacyKind);
    if (r.payment_detail_id && isUuid(String(r.payment_detail_id))) {
      setSelectedPaymentDetail(String(r.payment_detail_id));
    } else if (legacyKind) {
      const matched = resolvePaymentDetailIdFromKindLabel(legacyKind, paymentDetails);
      setSelectedPaymentDetail(matched || '');
    } else {
      setSelectedPaymentDetail('');
    }
    if (r.menu_id) {
      setSelectedMenu(r.menu_id);
      setMenuNameFree('');
    } else if (r.menu_name) {
      const mhit = menus.find((m) => m.name === r.menu_name);
      if (mhit) {
        setSelectedMenu(mhit.id);
        setMenuNameFree('');
      } else {
        setSelectedMenu('');
        setMenuNameFree(r.menu_name);
      }
    } else {
      setSelectedMenu('');
      setMenuNameFree('');
    }
    setPointsUsed(r.points_used != null ? String(r.points_used) : '0');
    setImportTicketRaw(
      (r.import_ticket_count_raw && String(r.import_ticket_count_raw).trim()) ||
        (r.points_used != null && r.points_used !== 0 ? String(r.points_used) : '')
    );
    setImportCsvVisitCount((r.import_csv_visit_count && String(r.import_csv_visit_count)) || '');
    setBeEquiv(r.be_equivalent_count != null ? String(r.be_equivalent_count) : '');
    setMaintenanceCost(r.maintenance_cost != null ? String(r.maintenance_cost) : '0');
    setMemo(stripKindPrefixFromMemo(r.memo) || '');
    setCurrentMediaUrls(r.media_urls || []);
    setPreviewUrls([]);
    setSelectedFiles([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRecentRecord = async (r: any) => {
    if (!window.confirm('この記録を削除しますか？')) return;
    const { error } = await supabase.from('visit_records').delete().eq('id', r.id);
    if (error) {
      alert(`削除失敗: ${error.message}`);
      return;
    }
    await recalcBeEquivalentCountsForCustomers([r.customer_id]);
    void loadRecentRecords();
    window.dispatchEvent(new Event('records-updated'));
  };

  const filteredRecentRecords = useMemo(() => {
    const q = normalizeSearchText(historyFilter);
    if (!q) return recentRecords;
    return recentRecords.filter((r) => {
      const c = r.customers;
      const customerKana = c?.name_kana || c?.kana || '';
      const hay = [
        c?.name,
        customerKana,
        c?.customer_number,
        r.staff_name,
        r.menu_name,
        r.memo,
        r.import_customer_name,
        r.visit_date,
      ]
        .filter(Boolean)
        .map(normalizeSearchText)
        .join(' ');
      return hay.includes(q);
    });
  }, [recentRecords, historyFilter]);

  const historyGroupsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    filteredRecentRecords.forEach((r) => {
      const key = String(r.visit_date || '').slice(0, 10) || '日付なし';
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, records]) => ({
        date,
        records,
        total: records.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      }));
  }, [filteredRecentRecords]);

  useEffect(() => {
    if (!historyPanelOpen || historyGroupsByDate.length === 0) return;
    setOpenHistoryDates((prev) => {
      const available = new Set(historyGroupsByDate.map((g) => g.date));
      if ([...prev].some((date) => available.has(date))) return prev;
      return new Set([historyGroupsByDate[0].date]);
    });
  }, [historyGroupsByDate, historyPanelOpen]);

  const toggleHistoryDate = (date: string) => {
    setOpenHistoryDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="space-y-4 pb-20">
      <div
        className={`rounded-2xl shadow-lg overflow-hidden border-4 ${
          editingId ? 'border-orange-500' : 'border-blue-100'
        }`}
      >
        <button
          type="button"
          onClick={() => setInputPanelOpen((v) => !v)}
          className={`w-full px-4 py-3 flex items-center justify-between text-left ${
            editingId ? 'bg-orange-50' : 'bg-blue-50'
          }`}
        >
          <h2 className="text-lg font-bold text-gray-800">
            {editingId ? '来院入力（修正モード）' : '来院入力'}
          </h2>
          <span className={`text-sm font-bold shrink-0 ${editingId ? 'text-orange-700' : 'text-blue-700'}`}>
            {inputPanelOpen ? '▲' : '▼'}
          </span>
        </button>
        {inputPanelOpen && (
          <div className="bg-white p-3 sm:p-6 border-t border-slate-200">
        {submitFlash && (
          <div
            className="mb-4 rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3 text-sm font-bold text-green-900"
            role="status"
          >
            {submitFlash}
          </div>
        )}
        <CustomerSearchPanel
          accent={editingId ? 'orange' : 'blue'}
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onClearSelection={() => {
            resetVisitFormDefaults();
            setSelectedCustomer(null);
          }}
          focusSearchSignal={searchFocusSignal}
        />
        {!selectedCustomer && (
          <p className="mt-4 text-sm text-gray-500">
            患者を検索して選ぶと、来院入力フォームが表示されます。
          </p>
        )}
        {selectedCustomer && (
        <form
          onSubmit={swallowFormSubmit}
          onKeyDown={blockEnterFormSubmit}
          onFocus={(e) => {
            // 非数値フィールドでは日本語入力を維持しやすくするヒントを与える
            if (isNumericOnlyFieldTarget(e.target)) return;
            if (e.target instanceof HTMLElement) e.target.setAttribute('lang', 'ja');
          }}
          className="space-y-4 mt-6"
        >
          {duplicateError && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-red-800 text-sm font-bold" role="alert">
              {duplicateError}
            </div>
          )}
          {placeholderCustomerWarning && !editingId && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 text-red-900 text-xs font-bold">
              {placeholderCustomerWarning}
            </div>
          )}
          {legacyNumberWarning && !editingId && !placeholderCustomerWarning && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 text-amber-900 text-xs whitespace-pre-line">
              {legacyNumberWarning}
            </div>
          )}
          <div className="flex gap-2">
            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="flex-1 p-3 border-2 rounded-lg font-bold" />
            <select value={clinicName} onChange={e => setClinicName(e.target.value as any)} className="flex-1 p-3 border-2 rounded-lg font-bold">
              {CLINIC_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border-2">
            <label className="block text-xs font-bold text-gray-500 mb-1 text-right">金額</label>
            <input
              type="number"
              inputMode="numeric"
              data-ime="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-right font-bold text-3xl text-blue-700 outline-none"
              placeholder="0"
            />
            <p className="text-xs text-gray-500 mt-1 text-right">支払がない場合も「0」と入力してください</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 font-bold">担当スタッフ</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setStaffId('')} className={`py-2 rounded-lg text-xs font-bold ${staffId === '' ? 'bg-slate-600 text-white' : 'bg-gray-100'}`}>未選択</button>
              {staffList.map(s => (<button key={s.id} type="button" onClick={() => setStaffId(s.id)} className={`py-2 rounded-lg text-xs font-bold ${staffId === s.id ? 'bg-indigo-500 text-white' : 'bg-gray-100'}`}>{s.name}</button>))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 font-bold">支払方法</label>
            <div className="grid grid-cols-3 gap-2">
              {paymentMethods.map(m => (<button key={m.id} type="button" onClick={() => setPaymentMethodId(m.id)} className={`py-3 px-2 rounded-lg font-bold text-sm ${paymentMethodId === m.id ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100'}`}>{m.name}</button>))}
            </div>
          </div>

          {importKindLegacy && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              取込データの種類: <strong>{importKindLegacy}</strong>
              <span className="block mt-0.5 text-amber-800">
                下の「種類」ボタンで選び直して保存すると、この表記は消えてマスタの名称になります。
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 font-bold">種類</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setSelectedPaymentDetail('')} className={`py-3 px-2 rounded-lg font-bold text-sm ${selectedPaymentDetail === '' ? 'bg-slate-600 text-white' : 'bg-gray-100'}`}>未選択</button>
              {paymentDetails.map(d => (<button key={d.id} type="button" onClick={() => setSelectedPaymentDetail(d.id)} className={`py-3 px-2 rounded-lg font-bold text-sm ${selectedPaymentDetail === d.id ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100'}`}>{d.name}</button>))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 font-bold">実施メニュー</label>
            <select value={selectedMenu} onChange={(e) => { setSelectedMenu(e.target.value); if (e.target.value) setMenuNameFree(''); }} className="w-full p-3 border-2 rounded-lg font-bold text-sm">
              <option value="">未選択</option>
              {menus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">マスタにない名称は下に直接入力（CSV/取込と同じ menu_name に保存されます）</p>
            <input
              type="text"
              inputMode="text"
              lang="ja"
              value={menuNameFree}
              onChange={(e) => setMenuNameFree(e.target.value)}
              className="w-full mt-2 p-2 border-2 border-dashed border-slate-200 rounded-lg text-sm"
              placeholder="メニュー名（マスタ外・任意）"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">通院count(表の値)</label>
              <input
                type="text"
                inputMode="numeric"
                data-ime="off"
                value={importCsvVisitCount}
                onChange={(e) => setImportCsvVisitCount(e.target.value)}
                className="w-full p-2 border-2 rounded-lg text-sm"
                placeholder="例: 15"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">実質BE回数</label>
              <input
                type="text"
                inputMode="numeric"
                data-ime="off"
                value={beEquiv}
                onChange={(e) => setBeEquiv(e.target.value)}
                className="w-full p-2 border-2 rounded-lg text-sm"
                placeholder="数値"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">回数券（表記）</label>
              <input
                type="text"
                inputMode="text"
                lang="ja"
                value={importTicketRaw}
                onChange={(e) => setImportTicketRaw(e.target.value)}
                className="w-full p-2 border-2 rounded-lg text-sm"
                placeholder="例: 13/16"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                data-ime="off"
                value={pointsUsed}
                onChange={(e) => setPointsUsed(e.target.value)}
                className="w-full p-3 border-2 rounded-lg pr-12 font-bold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">P使用</span>
            </div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                data-ime="off"
                value={maintenanceCost}
                onChange={(e) => setMaintenanceCost(e.target.value)}
                className="w-full p-3 border-2 border-amber-300 rounded-lg pr-12 font-bold"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-600">維持費</span>
            </div>
          </div>

          <textarea value={memo} onChange={e => setMemo(e.target.value)} className="w-full p-3 border-2 rounded-lg text-sm" placeholder="メモを入力..." rows={2} lang="ja" />

          <div className="p-3 sm:p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <div className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <Upload size={18} className="shrink-0" />
              写真（カメラ・アルバム）
            </div>
            <input
              ref={photoInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif"
              onChange={handleFileChange}
              className="hidden"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={openPhotoPicker}
              className="w-full min-h-12 py-3 px-4 rounded-xl border-2 border-blue-400 bg-blue-50 text-blue-900 font-bold text-sm active:bg-blue-100 touch-manipulation"
            >
              写真を撮る・選ぶ（タップ）
            </button>
            <p className="text-[11px] text-gray-500 mt-2 leading-snug">
              スマホでは上のボタンからカメラまたはアルバムを開きます。選択後「登録する」でアップロードされます。
            </p>
            {(currentMediaUrls.length > 0 || previewUrls.length > 0) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {currentMediaUrls.map((url, i) => (
                  <div key={`saved-${i}`} className="relative w-16 h-16 rounded border-2 border-blue-400 overflow-hidden shrink-0">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-[9px] text-white text-center font-bold">
                      保存済
                    </span>
                  </div>
                ))}
                {previewUrls.map((url, i) => (
                  <div key={`new-${i}`} className="relative w-16 h-16 rounded border-2 border-green-400 overflow-hidden shrink-0">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNewPreviewAt(i)}
                      className="absolute -top-1 -right-1 min-h-6 min-w-6 rounded-full bg-red-600 text-white text-xs font-bold leading-none shadow touch-manipulation"
                      aria-label="この写真を外す"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting} className={`w-full py-4 rounded-xl font-bold text-xl text-white shadow-lg ${editingId ? 'bg-orange-500' : 'bg-blue-600'}`}>
            {isSubmitting ? '画像を保存中...' : editingId ? '修正を保存する' : '登録する'}
          </button>
        </form>
        )}
          </div>
        )}
      </div>

      <div className="rounded-2xl shadow-lg overflow-hidden border border-slate-200">
        <button
          type="button"
          onClick={() => setHistoryPanelOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-slate-50"
        >
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <History className="text-slate-500" size={20} />
            来院履歴
          </h3>
          <span className="text-sm font-bold text-slate-600 shrink-0">{historyPanelOpen ? '▲' : '▼'}</span>
        </button>
        {historyPanelOpen && (
          <div className="bg-white p-3 sm:p-4 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <p className="text-xs text-gray-500">
                顧客番号・氏名・担当・メニュー名で検索できます。帯色：1–4999＝川西（緑）、5000以降＝高槻（青）（全{recentRecords.length}件
                {historyFilter ? `／表示${filteredRecentRecords.length}件` : ''}）。
              </p>
              <p className="text-xs font-bold text-slate-500">横1行表示 / 左で修正・右端で削除</p>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                data-ime="ja"
                lang="ja"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                onFocus={(e) => ensureJapaneseImeForInput(e.currentTarget)}
                placeholder="顧客番号・氏名・担当・メニュー名で検索..."
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-400 outline-none"
              />
            </div>
            {recentRecords.length === 0 ? (
              <p className="text-sm text-gray-500">履歴はまだありません</p>
            ) : filteredRecentRecords.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">検索条件に一致する履歴はありません</p>
            ) : (
              <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
                {historyGroupsByDate.map((group) => {
                  const isOpen = openHistoryDates.has(group.date);
                  return (
                    <div key={group.date} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => toggleHistoryDate(group.date)}
                        className="w-full flex items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronDown size={18} className="shrink-0 text-slate-600" /> : <ChevronRight size={18} className="shrink-0 text-slate-600" />}
                          <span className="font-bold text-slate-800">{formatCompactDate(group.date)}</span>
                          <span className="text-xs font-bold text-slate-500">{group.records.length}件</span>
                        </span>
                        <span className="text-sm font-bold text-blue-700 whitespace-nowrap">計 {formatYen(group.total)}</span>
                      </button>
                      {isOpen && (
                        <div className="overflow-auto border-t border-slate-200">
                          <div className="min-w-[48rem]">
                            <div className="grid grid-cols-[3.2rem_2.5rem_3.5rem_5.5rem_3.2rem_minmax(6.5rem,1fr)_5rem_6.5rem_4rem_3.2rem] items-center gap-x-1.5 gap-y-0 bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-600 border-b border-slate-200">
                              <div className="sticky left-0 z-10 bg-slate-100 -ml-1.5 pl-1.5">修正</div>
                              <div>月日</div>
                              <div>番号</div>
                              <div>氏名</div>
                              <div>実通院</div>
                              <div>メニュー</div>
                              <div>金額</div>
                              <div>支払/種類</div>
                              <div>担当</div>
                              <div className="sticky right-0 z-10 bg-slate-100 -mr-1.5 pr-1.5 text-right">削除</div>
                            </div>
                            <ul className="divide-y divide-slate-100">
                              {group.records.map((r) => {
                                const customerName = r.import_customer_name || r.customers?.name || '—';
                                const customerNumber = r.customers?.customer_number || '—';
                                const paymentMethod = formatPaymentMethodLabel(r.payment_method, methodNameMap);
                                const paymentDetail = formatPaymentDetailLabel(r.payment_detail_id, detailNameMap, r.import_kind_text, r.memo);
                                const rowBand = customerNumberHistoryRowClass(r.customers?.customer_number);
                                return (
                                  <li
                                    key={r.id}
                                    className={`grid grid-cols-[3.2rem_2.5rem_3.5rem_5.5rem_3.2rem_minmax(6.5rem,1fr)_5rem_6.5rem_4rem_3.2rem] items-center gap-x-1.5 gap-y-0 px-1.5 py-1 text-[11px] ${rowBand}`}
                                  >
                                    <div className="sticky left-0 z-10 shrink-0 bg-inherit -ml-1.5 pl-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                                      <button
                                        type="button"
                                        onClick={() => startEdit(r)}
                                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded border border-blue-300 text-blue-700 font-bold hover:bg-blue-50 whitespace-nowrap touch-manipulation"
                                      >
                                        <Edit2 size={12} />
                                        修正
                                      </button>
                                    </div>
                                    <div
                                      className="font-bold text-slate-800 whitespace-nowrap pl-0.5"
                                      title={formatCompactDate(r.visit_date)}
                                    >
                                      {formatVisitMonthDay(r.visit_date)}
                                    </div>
                                    <div className="font-bold text-slate-800 truncate" title={customerNumber}>{customerNumber}</div>
                                    <div className="font-bold text-slate-800 truncate" title={customerName}>{customerName}</div>
                                    <div className="font-bold text-blue-700 whitespace-nowrap">
                                      {r.be_equivalent_count == null ? '—' : `${r.be_equivalent_count}回`}
                                    </div>
                                    <div className="truncate text-slate-800" title={r.menu_name || ''}>{r.menu_name || '—'}</div>
                                    <div className="font-bold text-slate-900 whitespace-nowrap">{formatYen(r.amount)}</div>
                                    <div className="truncate text-slate-600" title={`${paymentMethod} / ${paymentDetail}`}>
                                      {paymentMethod}{paymentDetail !== '-' ? ` / ${paymentDetail}` : ''}
                                    </div>
                                    <div className="truncate text-slate-700" title={r.staff_name || ''}>{r.staff_name || '—'}</div>
                                    <div className="sticky right-0 z-10 flex justify-end shrink-0 bg-inherit -mr-1.5 pr-1.5 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                                      <button
                                        type="button"
                                        onClick={() => void deleteRecentRecord(r)}
                                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded border border-red-300 text-red-700 font-bold hover:bg-red-50 whitespace-nowrap touch-manipulation"
                                      >
                                        <Trash2 size={12} />
                                        削除
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

