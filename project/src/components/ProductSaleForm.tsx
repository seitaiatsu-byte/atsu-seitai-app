import { useState, useEffect } from 'react';
import { Calendar, CreditCard, Save, ShoppingBag, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
import { CLINIC_OPTIONS, type ClinicFullName } from '../lib/clinic';

type ProductMaster = Database['public']['Tables']['product_master']['Row'];
type PaymentMethodMaster = Database['public']['Tables']['payment_method_master']['Row'];
type StaffMaster = Database['public']['Tables']['staff_master']['Row'];
type CustomerRow = Database['public']['Tables']['customers']['Row'];

interface ProductSaleFormProps {
  onSuccess: () => void;
}

type Line = { productId: string; quantity: string };

const emptyLines = (): Line[] => [
  { productId: '', quantity: '1' },
  { productId: '', quantity: '1' },
  { productId: '', quantity: '1' },
];

export default function ProductSaleForm({ onSuccess }: ProductSaleFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodMaster[]>([]);
  const [staffList, setStaffList] = useState<StaffMaster[]>([]);

  const [lines, setLines] = useState<Line[]>(emptyLines);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [memo, setMemo] = useState('');
  const [clinicName, setClinicName] = useState<ClinicFullName>('高槻あつ整体院');
  const [staffId, setStaffId] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    loadProducts();
    loadPaymentMethods();
    loadStaff();
    const reloadMasters = () => {
      loadProducts();
      loadPaymentMethods();
      loadStaff();
    };
    window.addEventListener('masters-updated', reloadMasters);
    return () => window.removeEventListener('masters-updated', reloadMasters);
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

  const getProduct = (id: string) => products.find((p) => p.id === id);
  const getStaffName = (id: string) => staffList.find((s) => s.id === id)?.name || '';

  const lineAmount = (line: Line) => {
    const p = line.productId ? getProduct(line.productId) : null;
    if (!p) return 0;
    const q = parseInt(line.quantity, 10) || 1;
    return p.price * q;
  };

  const totalAmount = lines.reduce((s, l) => s + lineAmount(l), 0);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    for (const line of activeLines) {
      const p = getProduct(line.productId);
      if (!p) continue;
      const { data: existing } = await supabase
        .from('product_sales')
        .select('id')
        .eq('customer_id', selectedCustomer.id)
        .eq('sale_date', saleDate)
        .eq('product_id', line.productId)
        .maybeSingle();
      if (existing) {
        setDuplicateError(
          `同じ日（${saleDate}）・同じ顧客で「${p.name}」の物販が既に登録されています。重複登録はできません。`
        );
        return;
      }
    }

    setIsSubmitting(true);
    const staffNameResolved = staffId ? getStaffName(staffId) : '';

    const rows = activeLines.map((line) => {
      const p = getProduct(line.productId)!;
      const q = parseInt(line.quantity, 10) || 1;
      return {
        customer_id: selectedCustomer.id,
        sale_date: saleDate,
        product_id: line.productId,
        product_name: p.name,
        quantity: q,
        payment_method: paymentMethodId,
        amount: p.price * q,
        memo,
        clinic_name: clinicName,
        staff_name: staffNameResolved || null,
      };
    });

    const { error } = await supabase.from('product_sales').insert(rows);

    if (error) {
      console.error(error);
      alert(`登録に失敗しました: ${error.message}`);
      setIsSubmitting(false);
      return;
    }

    alert('登録完了しました');
    setSelectedCustomer(null);
    setLines(emptyLines());
    setMemo('');
    setStaffId('');
    setMediaFiles([]);
    setIsSubmitting(false);
    window.dispatchEvent(new Event('records-updated'));
    onSuccess();
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-orange-600 mb-4">物販記録（最大3商品）</h2>

      <CustomerSearchPanel
        accent="orange"
        selectedCustomer={selectedCustomer}
        onSelect={setSelectedCustomer}
        onClearSelection={() => setSelectedCustomer(null)}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="text-sm font-bold text-gray-700">合計金額</div>
          <div className="text-2xl font-bold text-amber-900">¥{totalAmount.toLocaleString()}</div>
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
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg disabled:opacity-50"
        >
          <Save size={24} />
          {isSubmitting ? '登録中...' : '登録'}
        </button>
      </form>
    </div>
  );
}
