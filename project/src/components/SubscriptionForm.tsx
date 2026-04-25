import { useState, useEffect } from 'react';
import { Calendar, CreditCard, Save, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
import { CLINIC_OPTIONS, type ClinicFullName } from '../lib/clinic';

type SubscriptionMaster = Database['public']['Tables']['subscription_master']['Row'];
type PaymentMethodMaster = Database['public']['Tables']['payment_detail_master']['Row'];
type StaffMaster = Database['public']['Tables']['staff_master']['Row'];
type CustomerRow = Database['public']['Tables']['customers']['Row'];

interface SubscriptionFormProps {
  onSuccess: () => void;
}

export default function SubscriptionForm({ onSuccess }: SubscriptionFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionMaster[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodMaster[]>([]);
  const [staffList, setStaffList] = useState<StaffMaster[]>([]);

  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [clinicName, setClinicName] = useState<ClinicFullName>('高槻あつ整体院');
  const [staffId, setStaffId] = useState('');
  const [pointsToAdd, setPointsToAdd] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    loadSubscriptions();
    loadPaymentMethods();
    loadStaff();
    const reloadMasters = () => {
      loadSubscriptions();
      loadPaymentMethods();
      loadStaff();
    };
    window.addEventListener('masters-updated', reloadMasters);
    return () => window.removeEventListener('masters-updated', reloadMasters);
  }, []);

  useEffect(() => {
    if (selectedSubscription) {
      const s = subscriptions.find((x) => x.id === selectedSubscription);
      if (s) {
        const price = Number((s as { price?: number }).price ?? 0);
        setAmount(String(price));
      }
    }
  }, [selectedSubscription, subscriptions]);

  const loadSubscriptions = async () => {
    const first = await supabase.from('subscription_master').select('*').order('display_order');
    if (!first.error) {
      setSubscriptions(first.data || []);
      return;
    }
    const fallback = await supabase.from('subscription_master').select('*');
    if (!fallback.error) setSubscriptions(fallback.data || []);
  };

  const loadPaymentMethods = async () => {
    const { data } = await supabase.from('payment_detail_master').select('*').eq('is_active', true).order('display_order');
    if (data?.length) {
      setPaymentMethods(data);
      setPaymentMethodId(data[0].id);
    }
  };

  const loadStaff = async () => {
    const { data } = await supabase.from('staff_master').select('*').eq('is_active', true).order('display_order');
    setStaffList(data || []);
  };

  const getSubName = (id: string) => subscriptions.find((s) => s.id === id)?.name || '';
  const getStaffName = (id: string) => staffList.find((s) => s.id === id)?.name || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateError('');
    if (!selectedCustomer) {
      alert('先に顧客を検索・選択してください');
      return;
    }
    if (!selectedSubscription) {
      alert('サブスクを選択してください');
      return;
    }

    const { data: existingSub } = await supabase
      .from('subscription_records')
      .select('id')
      .eq('customer_id', selectedCustomer.id)
      .eq('start_date', startDate)
      .eq('subscription_id', selectedSubscription)
      .maybeSingle();
    if (existingSub) {
      setDuplicateError(
        `同じ開始日（${startDate}）・同じ顧客・同じサブスク（${getSubName(selectedSubscription)}）の登録が既にあります。重複登録はできません。`
      );
      return;
    }

    setIsSubmitting(true);
    const staffNameResolved = staffId ? getStaffName(staffId) : '';

    const payload: Database['public']['Tables']['subscription_records']['Insert'] = {
      customer_id: selectedCustomer.id,
      subscription_id: selectedSubscription,
      subscription_name: getSubName(selectedSubscription),
      period_id: null,
      start_date: startDate,
      payment_method: paymentMethodId,
      amount: parseFloat(amount) || 0,
      memo,
      clinic_name: clinicName,
      staff_name: staffNameResolved || null,
    };

    const { error } = await supabase.from('subscription_records').insert([payload]);

    if (error) {
      console.error(error);
      alert(`登録に失敗しました: ${error.message}`);
      setIsSubmitting(false);
      return;
    }

    const pointsValue = parseInt(pointsToAdd, 10) || 0;
    if (pointsValue > 0) {
      const currentPoints = selectedCustomer.points || 0;
      await supabase.from('customers').update({ points: currentPoints + pointsValue }).eq('id', selectedCustomer.id);
    }

    alert('登録完了しました');
    setSelectedCustomer(null);
    setSelectedSubscription('');
    setPointsToAdd('0');
    setIsSubmitting(false);
    window.dispatchEvent(new Event('records-updated'));
    onSuccess();
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-purple-600 mb-4">サブスク記録</h2>

      <CustomerSearchPanel
        accent="purple"
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
            開始日
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            <Repeat className="inline mr-2" size={16} />
            サブスク（マスタ）
          </label>
          <div className="grid grid-cols-2 gap-2">
            {subscriptions.map((subscription) => (
              <button
                key={subscription.id}
                type="button"
                onClick={() => setSelectedSubscription(subscription.id)}
                className={`py-3 px-4 rounded-lg font-bold transition-all ${
                  selectedSubscription === subscription.id
                    ? 'bg-purple-500 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div>{subscription.name}</div>
                <div className="text-sm">¥{Number((subscription as { price?: number }).price ?? 0).toLocaleString()}</div>
              </button>
            ))}
          </div>
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
          <label className="block text-sm font-bold text-gray-700 mb-2">金額</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
            placeholder="0"
          />
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

        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-lg p-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">ポイント積算（付与）</label>
          <input
            type="number"
            value={pointsToAdd}
            onChange={(e) => setPointsToAdd(e.target.value)}
            className="w-full px-4 py-3 border-2 border-yellow-400 rounded-lg font-bold"
            min={0}
          />
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg disabled:opacity-50"
        >
          <Save size={24} />
          {isSubmitting ? '登録中...' : '登録'}
        </button>
      </form>
    </div>
  );
}
