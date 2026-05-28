import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, CreditCard, Save, Repeat, History, Edit2, Trash2, X, Search, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import CustomerSearchPanel from './CustomerSearchPanel';
import { CLINIC_OPTIONS, type ClinicFullName } from '../lib/clinic';
import { buildIdToNameMap, formatPaymentMethodLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import { visitRecordHadSubscriptionLabel, visitRecordMixedLabel } from '../lib/visitSubscriptionLabel';
import { blockEnterFormSubmit, swallowFormSubmit } from '../lib/formSubmitGuard';
import {
  formatCustomerNumberForMessage,
  hasSubscriptionOnDate,
  validateExplicitAmount,
} from '../lib/registrationValidation';

type SubscriptionMaster = Database['public']['Tables']['subscription_master']['Row'];
type PaymentMethodMaster = Database['public']['Tables']['payment_detail_master']['Row'];
type StaffMaster = Database['public']['Tables']['staff_master']['Row'];
type CustomerRow = Database['public']['Tables']['customers']['Row'];
type SubRecord = Database['public']['Tables']['subscription_records']['Row'] & {
  customers?: Pick<CustomerRow, 'id' | 'name' | 'customer_number'> | null;
};
type VisitRow = Database['public']['Tables']['visit_records']['Row'];
type VisitMisclass = VisitRow & {
  customers?: Pick<CustomerRow, 'id' | 'name' | 'customer_number'> | null;
  matchHint: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_CHUNK = 80;

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clinicShort(name: string | null | undefined): string {
  if (!name) return '-';
  if (name.includes('川西')) return '川西';
  if (name.includes('高槻')) return '高槻';
  return name;
}

export default function SubscriptionForm() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionMaster[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodMaster[]>([]);
  const [staffList, setStaffList] = useState<StaffMaster[]>([]);
  const [recentRecords, setRecentRecords] = useState<SubRecord[]>([]);
  const [paymentNameMap, setPaymentNameMap] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
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
  const [listFilter, setListFilter] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [dbRecordCount, setDbRecordCount] = useState<number | null>(null);
  const [visitMisclassified, setVisitMisclassified] = useState<VisitMisclass[]>([]);
  const [visitMisclassLoading, setVisitMisclassLoading] = useState(false);

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
      setPaymentNameMap(buildIdToNameMap(data));
      if (!editingId) setPaymentMethodId(data[0].id);
    }
  };

  const loadStaff = async () => {
    const { data } = await supabase.from('staff_master').select('*').eq('is_active', true).order('display_order');
    setStaffList(data || []);
  };

  const loadRecentRecords = useCallback(async () => {
    setListLoading(true);
    setListLoadError(null);
    let fetchError: string | null = null;
    try {
      const { count, error: countErr } = await supabase
        .from('subscription_records')
        .select('*', { count: 'exact', head: true });
      if (countErr) console.error('サブスク件数取得:', countErr);
      else setDbRecordCount(count ?? 0);

      const PAGE = 500;
      let from = 0;
      const all: SubRecord[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('subscription_records')
          .select('*')
          .order('start_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) {
          fetchError = error.message;
          break;
        }
        if (!data?.length) break;
        all.push(...(data as SubRecord[]));
        if (data.length < PAGE) break;
        from += data.length;
      }

      const customerIds = [...new Set(all.map((r) => r.customer_id).filter(Boolean))];
      const customerMap = new Map<string, Pick<CustomerRow, 'id' | 'name' | 'customer_number'>>();
      for (const ids of chunkIds(customerIds, ID_CHUNK)) {
        const { data: customers, error: custErr } = await supabase
          .from('customers')
          .select('id, name, customer_number')
          .in('id', ids);
        if (custErr) {
          console.error('顧客名の取得:', custErr);
          continue;
        }
        for (const c of customers || []) {
          customerMap.set(c.id, c);
        }
      }
      for (const r of all) {
        r.customers = customerMap.get(r.customer_id) ?? null;
      }

      setRecentRecords(all);
      if (!fetchError && count != null && count > 0 && all.length === 0) {
        fetchError = 'データはありますが一覧の取得に失敗しました。再読み込みをお試しください。';
      }
      setListLoadError(fetchError);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadVisitMisclassified = useCallback(async () => {
    setVisitMisclassLoading(true);
    try {
      const [{ data: pm }, { data: pd }] = await Promise.all([
        supabase.from('payment_method_master').select('id,name'),
        supabase.from('payment_detail_master').select('id,name'),
      ]);
      const detailMap = mergeIdNameMaps(
        pm as { id: string; name: string }[],
        pd as { id: string; name: string }[]
      );

      const PAGE = 500;
      let from = 0;
      const hits: VisitMisclass[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('visit_records')
          .select('*')
          .order('visit_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error || !data?.length) break;
        for (const row of data as VisitRow[]) {
          const amount = Number(row.amount ?? 0);
          if (!amount) continue;
          const mixed = visitRecordMixedLabel(row, detailMap);
          if (!visitRecordHadSubscriptionLabel(mixed)) continue;
          const hints: string[] = [];
          if (row.menu_name && /サブスク|定期|subscription/i.test(row.menu_name)) hints.push(`メニュー: ${row.menu_name}`);
          if (row.import_kind_text && /サブスク|定期|subscription/i.test(row.import_kind_text)) {
            hints.push(`種類: ${row.import_kind_text}`);
          }
          if (row.memo && /サブスク|定期|subscription/i.test(row.memo)) hints.push(`メモ: ${row.memo.slice(0, 40)}`);
          hits.push({
            ...row,
            matchHint: hints.join(' / ') || mixed.replace(/\s+/g, ' ').trim().slice(0, 60),
          });
        }
        if (data.length < PAGE) break;
        from += data.length;
      }

      const customerIds = [...new Set(hits.map((r) => r.customer_id).filter(Boolean))];
      const customerMap = new Map<string, Pick<CustomerRow, 'id' | 'name' | 'customer_number'>>();
      for (const ids of chunkIds(customerIds, ID_CHUNK)) {
        const { data: customers } = await supabase.from('customers').select('id, name, customer_number').in('id', ids);
        for (const c of customers || []) customerMap.set(c.id, c);
      }
      for (const r of hits) r.customers = customerMap.get(r.customer_id) ?? null;

      setVisitMisclassified(hits);
    } finally {
      setVisitMisclassLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentRecords();
    void loadVisitMisclassified();
  }, [loadRecentRecords, loadVisitMisclassified]);

  useEffect(() => {
    const h = () => {
      void loadRecentRecords();
      void loadVisitMisclassified();
    };
    window.addEventListener('records-updated', h);
    return () => window.removeEventListener('records-updated', h);
  }, [loadRecentRecords, loadVisitMisclassified]);

  const getSubName = (id: string) => subscriptions.find((s) => s.id === id)?.name || '';
  const getStaffName = (id: string) => staffList.find((s) => s.id === id)?.name || '';

  const resetForm = () => {
    setEditingId(null);
    setSelectedCustomer(null);
    setSelectedSubscription('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setMemo('');
    setStaffId('');
    setPointsToAdd('0');
    setDuplicateError('');
    if (paymentMethods.length) setPaymentMethodId(paymentMethods[0]!.id);
  };

  const startEdit = (r: SubRecord) => {
    setEditingId(r.id);
    setSelectedCustomer((r.customers as CustomerRow) || null);
    setStartDate((r.start_date || '').slice(0, 10));
    setClinicName((r.clinic_name as ClinicFullName) || '高槻あつ整体院');
    setAmount(r.amount != null ? String(r.amount) : '0');
    setMemo(r.memo || '');
    setPointsToAdd('0');
    setDuplicateError('');

    const subId = r.subscription_id || subscriptions.find((s) => s.name === r.subscription_name)?.id || '';
    setSelectedSubscription(subId);

    const rawPm = r.payment_method;
    if (rawPm && UUID_RE.test(String(rawPm))) {
      setPaymentMethodId(String(rawPm));
    } else {
      const hit = paymentMethods.find((m) => m.name === String(rawPm || ''));
      setPaymentMethodId(hit?.id || paymentMethods[0]?.id || '');
    }

    setStaffId(staffList.find((s) => s.name === r.staff_name)?.id || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredRecords = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return recentRecords;
    return recentRecords.filter((r) => {
      const c = r.customers;
      const hay = [
        c?.name,
        c?.customer_number,
        r.subscription_name,
        r.staff_name,
        r.memo,
        r.clinic_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recentRecords, listFilter]);

  const handleSubmit = async () => {
    setDuplicateError('');
    if (!selectedCustomer) {
      alert('先に顧客を検索・選択してください');
      return;
    }
    if (!selectedSubscription) {
      alert('サブスクを選択してください');
      return;
    }

    const amountError = validateExplicitAmount(amount);
    if (amountError) {
      alert(amountError);
      return;
    }

    if (await hasSubscriptionOnDate(selectedCustomer.id, startDate, editingId)) {
      const cn = formatCustomerNumberForMessage(selectedCustomer.customer_number);
      setDuplicateError(
        `顧客番号 ${cn}・開始日 ${startDate} のサブスク記録は既に登録されています。重複登録はできません。`
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
      amount: Number(amount.trim()),
      memo,
      clinic_name: clinicName,
      staff_name: staffNameResolved || null,
    };

    const { error } = editingId
      ? await supabase.from('subscription_records').update(payload).eq('id', editingId)
      : await supabase.from('subscription_records').insert([payload]);

    if (error) {
      console.error(error);
      alert(`${editingId ? '修正' : '登録'}に失敗しました: ${error.message}`);
      setIsSubmitting(false);
      return;
    }

    if (!editingId) {
      const pointsValue = parseInt(pointsToAdd, 10) || 0;
      if (pointsValue > 0) {
        const currentPoints = selectedCustomer.points || 0;
        await supabase.from('customers').update({ points: currentPoints + pointsValue }).eq('id', selectedCustomer.id);
      }
    }

    alert(editingId ? '修正しました' : '登録完了しました');
    resetForm();
    setIsSubmitting(false);
    void loadRecentRecords();
    window.dispatchEvent(new Event('records-updated'));
  };

  const handleDelete = async (r: SubRecord) => {
    const c = r.customers;
    const label = c ? `${c.customer_number} ${c.name}` : '（顧客不明）';
    if (!window.confirm(`${label} のサブスク登録（${r.start_date}・${r.subscription_name || 'プラン'}）を削除しますか？`)) return;
    const { error } = await supabase.from('subscription_records').delete().eq('id', r.id);
    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    if (editingId === r.id) resetForm();
    void loadRecentRecords();
    window.dispatchEvent(new Event('records-updated'));
  };

  return (
    <div className="space-y-6 pb-20">
      <div
        className={`bg-white rounded-2xl shadow-lg p-6 border-4 ${editingId ? 'border-orange-400' : 'border-transparent'}`}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-2xl font-bold text-purple-600">
            {editingId ? '【修正モード】サブスク記録' : 'サブスク記録'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <X size={16} />
              修正をやめる
            </button>
          )}
        </div>

        <CustomerSearchPanel
          accent={editingId ? 'orange' : 'purple'}
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onClearSelection={() => setSelectedCustomer(null)}
        />

        <form onSubmit={swallowFormSubmit} onKeyDown={blockEnterFormSubmit} className="space-y-4 mt-4">
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
            <p className="text-xs text-gray-500 mt-1">支払がない場合も「0」と入力してください</p>
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

          {!editingId && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-lg p-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">ポイント積算（付与）</label>
              <input
                type="number"
                value={pointsToAdd}
                onChange={(e) => setPointsToAdd(e.target.value)}
                className="w-full px-4 py-3 border-2 border-yellow-400 rounded-lg font-bold"
                min={0}
              />
              <p className="text-xs text-amber-800 mt-1">新規登録時のみ付与されます（修正時は変更しません）</p>
            </div>
          )}

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
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-2 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg disabled:opacity-50 ${
              editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-500 hover:bg-purple-600'
            }`}
          >
            <Save size={24} />
            {isSubmitting ? '保存中...' : editingId ? '修正を保存' : '登録'}
          </button>
        </form>
      </div>

      <div className="bg-amber-50 rounded-2xl shadow-lg p-6 border-2 border-amber-300">
        <h3 className="text-lg font-bold text-amber-900 mb-1 flex items-center gap-2">
          <AlertTriangle className="text-amber-600" size={20} />
          来院記録で「サブスク」と入っている行（金額あり・要確認）
        </h3>
        <p className="text-xs text-amber-900/90 mb-3">
          以前の売上集計でサブスク列に入っていた候補です（全{visitMisclassified.length}件）。
          修正は <strong>ホーム → 来院入力</strong> の履歴リストから行えます。サブスク料金として残す場合は、この画面でサブスク登録し、来院側は都度払いのメニュー名に直してください。
        </p>
        {visitMisclassLoading ? (
          <p className="text-sm text-amber-800 py-4 text-center">読み込み中…</p>
        ) : visitMisclassified.length === 0 ? (
          <p className="text-sm text-amber-800 py-4 text-center">該当する来院記録はありません</p>
        ) : (
          <div className="space-y-2 max-h-[min(50vh,480px)] overflow-y-auto pr-1">
            {visitMisclassified.map((v) => {
              const c = v.customers;
              return (
                <div key={v.id} className="rounded-xl border-2 border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-bold text-amber-900">{v.visit_date}</span>
                    <span className="font-bold text-gray-900">
                      {c?.customer_number ? `${c.customer_number} ` : ''}
                      {c?.name || v.import_customer_name || '（顧客不明）'}
                    </span>
                    <span className="font-bold text-red-700">¥{Number(v.amount).toLocaleString()}</span>
                    <span className="text-xs text-gray-500">{clinicShort(v.clinic_name)}</span>
                  </div>
                  <p className="text-xs text-amber-800 mt-1 truncate" title={v.matchHint}>
                    該当: {v.matchHint}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => void loadVisitMisclassified()}
          disabled={visitMisclassLoading}
          className="mt-3 w-full py-2 rounded-xl text-sm font-bold bg-amber-200 text-amber-900 border-2 border-amber-300 disabled:opacity-50"
        >
          {visitMisclassLoading ? '読込中…' : 'この一覧を再読み込み'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 border border-purple-100">
        <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <History className="text-purple-500" size={20} />
          サブスク登録リスト（確認・修正・削除）
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          サブスク入力画面から登録した記録の一覧です（全{recentRecords.length}件
          {dbRecordCount != null ? `／DB登録${dbRecordCount}件` : ''}
          {listFilter ? `／表示${filteredRecords.length}件` : ''}）。行の右で修正・削除できます。
        </p>
        <p className="text-xs text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
          売上集計の「サブスク」列に載るのは、<strong>この画面で登録した分だけ</strong>です。来院入力のメニュー名に「サブスク」とあっても、売上のサブスク列には含まれません（都度払い等として集計されます）。
        </p>

        {listLoadError && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border-2 border-red-200 text-red-800 text-sm font-bold" role="alert">
            一覧の読み込みエラー: {listLoadError}
            <button type="button" onClick={() => void loadRecentRecords()} className="ml-2 underline">
              再読み込み
            </button>
          </div>
        )}

        <div className="relative mb-4 flex gap-2 items-stretch">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="search"
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              placeholder="顧客番号・氏名・プラン名で絞り込み..."
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadRecentRecords()}
            disabled={listLoading}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold bg-purple-100 text-purple-800 border-2 border-purple-200 disabled:opacity-50"
          >
            {listLoading ? '読込中…' : '更新'}
          </button>
        </div>

        {listLoading && recentRecords.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">読み込み中…</p>
        ) : filteredRecords.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {recentRecords.length === 0
              ? dbRecordCount != null && dbRecordCount > 0
                ? '登録データはありますが表示できませんでした。「更新」を押すか、しばらくしてから再度お試しください。'
                : 'サブスク入力での登録はまだありません'
              : '該当する登録がありません'}
          </p>
        ) : (
          <div className="space-y-2 max-h-[min(70vh,640px)] overflow-y-auto pr-1">
            {filteredRecords.map((r) => {
              const c = r.customers;
              const payLabel = formatPaymentMethodLabel(r.payment_method, paymentNameMap);
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border-2 p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                    editingId === r.id ? 'border-orange-400 bg-orange-50/50' : 'border-gray-100 bg-slate-50/80'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-bold text-purple-800">{r.start_date}</span>
                      <span className="text-xs text-gray-500">
                        登録: {(r.created_at || '').slice(0, 10)}
                      </span>
                    </div>
                    <div className="font-bold text-gray-900 truncate">
                      {c?.customer_number ? `${c.customer_number} ` : ''}
                      {c?.name || '（顧客不明）'}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-bold text-purple-700">{r.subscription_name || '（プラン名なし）'}</span>
                      <span className="mx-2">¥{Number(r.amount || 0).toLocaleString()}</span>
                      <span className="text-gray-500">{payLabel}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                      <span>院: {clinicShort(r.clinic_name)}</span>
                      {r.staff_name ? <span>担当: {r.staff_name}</span> : null}
                      {r.memo ? <span className="truncate max-w-full">メモ: {r.memo}</span> : null}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 sm:flex-col sm:gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="flex items-center justify-center gap-1 px-3 py-2 text-sm font-bold text-blue-700 bg-white border-2 border-blue-200 rounded-lg hover:bg-blue-50"
                      title="修正"
                    >
                      <Edit2 size={16} />
                      修正
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(r)}
                      className="flex items-center justify-center gap-1 px-3 py-2 text-sm font-bold text-red-700 bg-white border-2 border-red-200 rounded-lg hover:bg-red-50"
                      title="削除"
                    >
                      <Trash2 size={16} />
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
