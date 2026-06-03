import { useState, useEffect, useMemo } from 'react';
import { Calendar, CreditCard, Save, ShoppingBag, Upload, X, History, ChevronDown, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
import { CLINIC_OPTIONS, customerNumberHistoryRowClass, type ClinicFullName } from '../lib/clinic';
import { blockEnterFormSubmit, swallowFormSubmit } from '../lib/formSubmitGuard';
import {
  formatCustomerNumberForMessage,
  hasProductSaleOnDate,
  splitAmountAcrossLines,
  validateExplicitAmount,
} from '../lib/registrationValidation';

type ProductMaster = Database['public']['Tables']['product_master']['Row'];
type PaymentMethodMaster = Database['public']['Tables']['payment_method_master']['Row'];
type StaffMaster = Database['public']['Tables']['staff_master']['Row'];
type CustomerRow = Database['public']['Tables']['customers']['Row'];
type ProductSaleRow = Database['public']['Tables']['product_sales']['Row'] & {
  customers?: Pick<CustomerRow, 'id' | 'name' | 'customer_number'> | null;
};

type Line = { productId: string; quantity: string };

const emptyLines = (): Line[] => [
  { productId: '', quantity: '1' },
  { productId: '', quantity: '1' },
  { productId: '', quantity: '1' },
];

function formatCompactDate(raw: unknown): string {
  const s = String(raw || '').slice(0, 10);
  return s ? s.replace(/-/g, '/') : '—';
}

function formatYen(raw: unknown): string {
  const n = Number(raw || 0);
  return `¥${Number.isFinite(n) ? Math.round(n).toLocaleString() : '0'}`;
}

export default function ProductSaleForm() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodMaster[]>([]);
  const [staffList, setStaffList] = useState<StaffMaster[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(emptyLines);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [memo, setMemo] = useState('');
  const [clinicName, setClinicName] = useState<ClinicFullName>('高槻あつ整体院');
  const [staffId, setStaffId] = useState('');
  const [amount, setAmount] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [recentRecords, setRecentRecords] = useState<ProductSaleRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [openDates, setOpenDates] = useState<Set<string>>(new Set());
  const [inputPanelOpen, setInputPanelOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);

  useEffect(() => {
    loadProducts();
    loadPaymentMethods();
    loadStaff();
    void loadRecentRecords();
    const reloadMasters = () => {
      loadProducts();
      loadPaymentMethods();
      loadStaff();
    };
    const reloadRecords = () => void loadRecentRecords();
    window.addEventListener('masters-updated', reloadMasters);
    window.addEventListener('records-updated', reloadRecords);
    return () => {
      window.removeEventListener('masters-updated', reloadMasters);
      window.removeEventListener('records-updated', reloadRecords);
    };
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase.from('product_master').select('*').eq('is_active', true).order('display_order');
    setProducts(data || []);
  };

  const loadPaymentMethods = async () => {
    const { data } = await supabase.from('payment_method_master').select('*').eq('is_active', true).order('display_order');
    if (data?.length) {
      setPaymentMethods(data);
      setPaymentMethodId(data[0].id);
    }
  };

  const loadStaff = async () => {
    const { data } = await supabase.from('staff_master').select('*').eq('is_active', true).order('display_order');
    setStaffList(data || []);
  };

  const loadRecentRecords = async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_sales')
        .select('*')
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        console.error('物販履歴取得エラー:', error);
        return;
      }
      const rows = (data || []) as ProductSaleRow[];
      const ids = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
      const customerMap = new Map<string, Pick<CustomerRow, 'id' | 'name' | 'customer_number'>>();
      if (ids.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id,name,customer_number')
          .in('id', ids);
        for (const c of customers || []) customerMap.set(c.id, c);
      }
      for (const r of rows) r.customers = customerMap.get(r.customer_id) ?? null;
      setRecentRecords(rows);
      setOpenDates((prev) => {
        if (prev.size > 0) return prev;
        const d = (rows[0]?.sale_date || '').slice(0, 10);
        return d ? new Set([d]) : prev;
      });
    } finally {
      setListLoading(false);
    }
  };

  const getProduct = (id: string) => products.find((p) => p.id === id);
  const getStaffName = (id: string) => staffList.find((s) => s.id === id)?.name || '';
  const paymentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    paymentMethods.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [paymentMethods]);
  const paymentLabel = (raw: string | null | undefined) => (raw && paymentNameMap.get(raw)) || raw || '-';

  const resetForm = () => {
    setEditingId(null);
    setSelectedCustomer(null);
    setLines(emptyLines());
    setAmount('');
    setMemo('');
    setStaffId('');
    setMediaFiles([]);
    setDuplicateError('');
    if (paymentMethods.length) setPaymentMethodId(paymentMethods[0]!.id);
  };

  /** 履歴から修正保存後：顧客・パネル・日付の開閉を維持し次の修正へ */
  const clearEditModeKeepContext = (historyDate?: string) => {
    setEditingId(null);
    setLines(emptyLines());
    setAmount('');
    setMemo('');
    setStaffId('');
    setMediaFiles([]);
    setDuplicateError('');
    setInputPanelOpen(true);
    setHistoryPanelOpen(true);
    const d = (historyDate || '').slice(0, 10);
    if (d) setOpenDates((prev) => new Set(prev).add(d));
  };

  const startEdit = (r: ProductSaleRow) => {
    setEditingId(r.id);
    setSelectedCustomer((r.customers as CustomerRow) || null);
    setSaleDate((r.sale_date || '').slice(0, 10));
    setLines([
      { productId: r.product_id || '', quantity: String(r.quantity || 1) },
      { productId: '', quantity: '1' },
      { productId: '', quantity: '1' },
    ]);
    setPaymentMethodId(
      paymentMethods.find((m) => m.id === r.payment_method || m.name === String(r.payment_method || ''))?.id ||
        paymentMethods[0]?.id ||
        ''
    );
    setAmount(r.amount != null ? String(r.amount) : '0');
    setMemo(r.memo || '');
    setClinicName((r.clinic_name as ClinicFullName) || '高槻あつ整体院');
    setStaffId(staffList.find((s) => s.name === r.staff_name)?.id || '');
    setDuplicateError('');
    setInputPanelOpen(true);
    setHistoryPanelOpen(true);
    const d = (r.sale_date || '').slice(0, 10);
    if (d) setOpenDates((prev) => new Set(prev).add(d));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lineAmount = (line: Line) => {
    const p = line.productId ? getProduct(line.productId) : null;
    if (!p) return 0;
    const q = parseInt(line.quantity, 10) || 1;
    return p.price * q;
  };

  const totalAmount = lines.reduce((s, l) => s + lineAmount(l), 0);
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, ProductSaleRow[]>();
    for (const r of recentRecords) {
      const d = (r.sale_date || '').slice(0, 10) || '日付不明';
      if (!grouped.has(d)) grouped.set(d, []);
      grouped.get(d)!.push(r);
    }
    return [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [recentRecords]);

  const toggleDate = (dateKey: string) => {
    setOpenDates((prev) => {
      const n = new Set(prev);
      if (n.has(dateKey)) n.delete(dateKey);
      else n.add(dateKey);
      return n;
    });
  };

  const handleMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const max = 50 * 1024 * 1024;
    const next = Array.from(e.target.files).filter((f) => {
      if (f.size > max) {
        alert(`${f.name} は50MBを超えているため追加できません`);
        return false;
      }
      return true;
    });
    setMediaFiles((prev) => [...prev, ...next]);
  };

  const handleSubmit = async () => {
    setDuplicateError('');
    if (!selectedCustomer) {
      alert('先に顧客を検索・選択してください');
      return;
    }
    const activeLines = lines.filter((l) => l.productId);
    if (activeLines.length === 0) {
      alert('商品を1つ以上選択してください');
      return;
    }

    const productIdsInForm = new Map<string, number[]>();
    for (let i = 0; i < lines.length; i++) {
      const pid = lines[i]?.productId;
      if (!pid) continue;
      const arr = productIdsInForm.get(pid) || [];
      arr.push(i);
      productIdsInForm.set(pid, arr);
    }
    for (const [pid, idxs] of productIdsInForm) {
      if (idxs.length < 2) continue;
      const p = getProduct(pid);
      setDuplicateError(
        `同じ画面で「${p?.name ?? '商品'}」を複数行に選べません（行の重複）。1商品1行にしてください。`
      );
      return;
    }

    const amountError = validateExplicitAmount(amount);
    if (amountError) {
      alert(amountError);
      return;
    }

    const duplicateExists = editingId
      ? await (async () => {
          const { data } = await supabase
            .from('product_sales')
            .select('id')
            .eq('customer_id', selectedCustomer.id)
            .eq('sale_date', saleDate)
            .neq('id', editingId)
            .limit(1)
            .maybeSingle();
          return !!data;
        })()
      : await hasProductSaleOnDate(selectedCustomer.id, saleDate);
    if (duplicateExists) {
      const cn = formatCustomerNumberForMessage(selectedCustomer.customer_number);
      setDuplicateError(
        `顧客番号 ${cn}・販売日 ${saleDate} の物販記録は既に登録されています。重複登録はできません。`
      );
      return;
    }

    setIsSubmitting(true);
    const staffNameResolved = staffId ? getStaffName(staffId) : '';
    const amountValue = Number(amount.trim());
    const lineAmounts = editingId ? [amountValue] : splitAmountAcrossLines(amountValue, activeLines.length);

    const rows = activeLines.map((line, idx) => {
      const p = getProduct(line.productId)!;
      const q = parseInt(line.quantity, 10) || 1;
      return {
        customer_id: selectedCustomer.id,
        sale_date: saleDate,
        product_id: line.productId,
        product_name: p.name,
        quantity: q,
        payment_method: paymentMethodId,
        amount: lineAmounts[idx] ?? amountValue,
        memo,
        clinic_name: clinicName,
        staff_name: staffNameResolved || null,
      };
    });

    const { error } = editingId
      ? await supabase.from('product_sales').update(rows[0]).eq('id', editingId)
      : await supabase.from('product_sales').insert(rows);

    if (error) {
      console.error(error);
      alert(`${editingId ? '修正' : '登録'}に失敗しました: ${error.message}`);
      setIsSubmitting(false);
      return;
    }

    const wasEdit = Boolean(editingId);
    alert(wasEdit ? '修正しました' : '登録完了しました');
    if (wasEdit) clearEditModeKeepContext(saleDate);
    else resetForm();
    setIsSubmitting(false);
    void loadRecentRecords();
    window.dispatchEvent(new Event('records-updated'));
  };

  const handleDelete = async (r: ProductSaleRow) => {
    const c = r.customers;
    const label = c ? `${c.customer_number || ''} ${c.name}`.trim() : '（顧客不明）';
    if (!window.confirm(`${label} の物販記録（${r.sale_date}・${r.product_name || '商品'}）を削除しますか？`)) return;
    const { error } = await supabase.from('product_sales').delete().eq('id', r.id);
    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    if (editingId === r.id) clearEditModeKeepContext(r.sale_date);
    void loadRecentRecords();
    window.dispatchEvent(new Event('records-updated'));
  };

  return (
    <div className="space-y-4 pb-20">
      <div
        className={`rounded-2xl shadow-lg overflow-hidden border-4 ${
          editingId ? 'border-orange-400' : 'border-orange-100'
        }`}
      >
        <button
          type="button"
          onClick={() => setInputPanelOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-orange-50"
        >
          <h2 className="text-lg font-bold text-gray-800">
            {editingId ? '物販記録（修正モード）' : '物販記録（最大3商品）'}
          </h2>
          <span className="text-sm font-bold text-orange-700 shrink-0">{inputPanelOpen ? '▲' : '▼'}</span>
        </button>
        {inputPanelOpen && (
          <div className="bg-white p-6 border-t border-orange-100">
      {editingId && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <X size={16} />
            修正をやめる
          </button>
        </div>
      )}

      <CustomerSearchPanel
        accent="orange"
        selectedCustomer={selectedCustomer}
        onSelect={setSelectedCustomer}
        onClearSelection={() => setSelectedCustomer(null)}
      />

      <form onSubmit={swallowFormSubmit} onKeyDown={blockEnterFormSubmit} className="space-y-4">
        {duplicateError && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-red-800 text-sm font-bold" role="alert">
            {duplicateError}
          </div>
        )}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            <Calendar className="inline mr-2" size={16} />
            販売日
          </label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-orange-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            <ShoppingBag className="inline mr-2" size={16} />
            商品（3行まで）
          </label>
          {lines.map((line, idx) => (
            <div key={idx} className="mb-3 p-3 rounded-xl border-2 border-orange-100 bg-orange-50/50 space-y-2">
              <div className="text-xs font-bold text-orange-800">商品 {idx + 1}</div>
              <select
                value={line.productId}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...next[idx], productId: e.target.value };
                  setLines(next);
                }}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg"
              >
                <option value="">選択してください</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（¥{p.price.toLocaleString()}）
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-600">数量</span>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...next[idx], quantity: e.target.value };
                    setLines(next);
                  }}
                  className="w-24 px-2 py-1 border rounded-lg"
                />
                <span className="text-sm font-bold text-orange-700 ml-auto">
                  小計 ¥{lineAmount(line).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-200">
          <label className="block text-sm font-bold text-gray-700 mb-2">金額</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-3 border-2 border-amber-300 rounded-lg font-bold text-2xl text-amber-900 text-right focus:border-orange-500 outline-none"
            placeholder="0"
          />
          <p className="text-xs text-amber-800 mt-2">支払がない場合も「0」と入力してください</p>
          {totalAmount > 0 && (
            <p className="text-xs text-gray-600 mt-1">商品マスタ合計の参考: ¥{totalAmount.toLocaleString()}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            <CreditCard className="inline mr-2" size={16} />
            支払方法
          </label>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethodId(m.id)}
                className={`py-3 px-2 rounded-lg font-bold text-sm ${
                  paymentMethodId === m.id ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">院名</label>
          <div className="grid grid-cols-2 gap-2">
            {CLINIC_OPTIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setClinicName(c.value)}
                className={`py-3 px-4 rounded-lg font-bold ${
                  clinicName === c.value
                    ? c.color === 'blue'
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-orange-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">担当（スタッフマスタ）</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStaffId('')}
              className={`px-3 py-2 rounded-lg text-sm font-bold ${staffId === '' ? 'bg-slate-600 text-white' : 'bg-gray-100'}`}
            >
              未選択
            </button>
            {staffList.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStaffId(s.id)}
                className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  staffId === s.id ? 'bg-indigo-500 text-white' : 'bg-gray-100'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">メモ</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg resize-none"
          />
        </div>

        <div className="border-2 border-dashed border-orange-200 rounded-xl p-4 bg-orange-50/30">
          <label className="block text-sm font-bold text-gray-700 mb-2">
            <Upload className="inline mr-2" size={16} />
            画像・動画エリア（フロントのみ・最大50MB/ファイル。保存は行いません）
          </label>
          <input type="file" multiple accept="image/*,video/*" onChange={handleMedia} className="w-full text-sm" />
          {mediaFiles.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {mediaFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex justify-between items-center bg-white rounded p-2">
                  <span className="truncate">{f.name}</span>
                  <button type="button" onClick={() => setMediaFiles((p) => p.filter((_, j) => j !== i))}>
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg disabled:opacity-50"
        >
          <Save size={24} />
          {isSubmitting ? '保存中...' : editingId ? '修正を保存' : '登録'}
        </button>
      </form>
          </div>
        )}
      </div>

      <div className="rounded-2xl shadow-lg overflow-hidden border border-orange-100">
        <button
          type="button"
          onClick={() => setHistoryPanelOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-orange-50"
        >
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <History className="text-orange-500" size={20} />
            物販履歴（日付ごと）
          </h3>
          <span className="text-sm font-bold text-slate-600 shrink-0">{historyPanelOpen ? '▲' : '▼'}</span>
        </button>
        {historyPanelOpen && (
          <div className="bg-white p-4 border-t border-orange-100">
            <p className="text-xs text-gray-500 mb-3">帯色：1–4999＝川西（緑）、5000以降＝高槻（青）</p>
        {listLoading ? (
          <p className="text-sm text-gray-500 py-4">読み込み中…</p>
        ) : recordsByDate.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">物販入力の履歴はまだありません</p>
        ) : (
          <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
            {recordsByDate.map(([dateKey, dayRows]) => {
              const isOpen = openDates.has(dateKey);
              const dayTotal = dayRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
              return (
                <div key={dateKey} className="rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDate(dateKey)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left bg-slate-50 hover:bg-slate-100"
                  >
                    <span className="flex items-center gap-2 font-bold text-slate-800 min-w-0">
                      {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      {formatCompactDate(dateKey)}
                      <span className="text-xs font-bold text-slate-500">{dayRows.length}件</span>
                    </span>
                    <span className="text-sm font-bold text-blue-700 whitespace-nowrap">計 {formatYen(dayTotal)}</span>
                  </button>
                  {isOpen && (
                    <div className="overflow-auto border-t border-slate-200 bg-white">
                      <div className="min-w-[44rem]">
                        <div className="grid grid-cols-[4.5rem_3.5rem_5.5rem_minmax(7rem,1fr)_2.5rem_5rem_6rem_4.8rem] items-center gap-1 bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-slate-600 border-b border-slate-200">
                          <div>日付</div>
                          <div>番号</div>
                          <div>氏名</div>
                          <div>商品</div>
                          <div>数量</div>
                          <div>金額</div>
                          <div>支払</div>
                          <div className="text-right">操作</div>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {dayRows.map((r) => {
                            const customerName = r.customers?.name || '（顧客不明）';
                            const customerNumber = r.customers?.customer_number || '—';
                            const rowBand = customerNumberHistoryRowClass(r.customers?.customer_number);
                            return (
                              <li
                                key={r.id}
                                className={`grid grid-cols-[4.5rem_3.5rem_5.5rem_minmax(7rem,1fr)_2.5rem_5rem_6rem_4.8rem] items-center gap-1 px-1.5 py-1 text-[11px] ${rowBand} ${
                                  editingId === r.id ? 'ring-1 ring-orange-400' : ''
                                }`}
                              >
                                <div className="font-bold text-slate-800 whitespace-nowrap">{formatCompactDate(r.sale_date)}</div>
                                <div className="font-bold text-slate-800 truncate" title={customerNumber}>{customerNumber}</div>
                                <div className="font-bold text-slate-800 truncate" title={customerName}>{customerName}</div>
                                <div className="truncate text-slate-800" title={r.product_name || ''}>{r.product_name || '商品未設定'}</div>
                                <div className="font-bold text-slate-700 whitespace-nowrap">{r.quantity || 1}</div>
                                <div className="font-bold text-slate-900 whitespace-nowrap">{formatYen(r.amount)}</div>
                                <div className="truncate text-slate-600" title={paymentLabel(r.payment_method)}>{paymentLabel(r.payment_method)}</div>
                                <div className="flex justify-end gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => startEdit(r)}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-blue-300 text-blue-700 font-bold hover:bg-blue-50 whitespace-nowrap"
                                  >
                                    <Edit2 size={12} />
                                    修正
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(r)}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-red-300 text-red-700 font-bold hover:bg-red-50 whitespace-nowrap"
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
