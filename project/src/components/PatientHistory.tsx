import { useState, useEffect } from 'react';
import { X, Calendar, ShoppingBag, CreditCard, User, AlertCircle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { formatPaymentDetailLabel, formatPaymentMethodLabel, mergeIdNameMaps } from '../lib/paymentDisplay';
import { ClinicNameFromCustomer } from './ClinicNameDisplay';

type Customer = Database['public']['Tables']['customers']['Row'];
type VisitRow = Database['public']['Tables']['visit_records']['Row'];
type ProductRow = Database['public']['Tables']['product_sales']['Row'];
type SubRow = Database['public']['Tables']['subscription_records']['Row'];

interface HistoryRecord {
  id: string;
  date: string;
  type: 'visit' | 'product' | 'subscription';
  name: string;
  amount: number;
  paymentMethod: string;
  /** 来院のみ */
  paymentDetail?: string;
  staff: string;
  memo: string;
  quantity?: number;
  unitPrice?: number;
}

interface PatientHistoryProps {
  customer: Customer;
  onClose: () => void;
}

export default function PatientHistory({ customer, onClose }: PatientHistoryProps) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVisits: 0,
    totalSpent: 0,
    visitTotal: 0,
    productTotal: 0,
    subscriptionTotal: 0,
    avgSpending: 0,
    lastVisit: '',
    daysSinceLastVisit: 0,
  });

  useEffect(() => {
    loadHistory();
  }, [customer.id]);

  const loadHistory = async () => {
    setLoading(true);

    const [{ data: visits }, { data: pm }, { data: pd }] = await Promise.all([
      supabase.from('visit_records').select('*').eq('customer_id', customer.id).order('visit_date', { ascending: false }),
      supabase.from('payment_method_master').select('id,name'),
      supabase.from('payment_detail_master').select('id,name'),
    ]);
    const merged = mergeIdNameMaps(pm as { id: string; name: string }[], pd as { id: string; name: string }[]);

    const { data: products } = await supabase
      .from('product_sales')
      .select('*')
      .eq('customer_id', customer.id)
      .order('sale_date', { ascending: false });

    const { data: subscriptions } = await supabase
      .from('subscription_records')
      .select('*')
      .eq('customer_id', customer.id)
      .order('start_date', { ascending: false });

    const allRecords: HistoryRecord[] = [
      ...(visits || []).map((v: VisitRow) => ({
        id: v.id,
        date: v.visit_date,
        type: 'visit' as const,
        name: v.menu_name || '不明',
        amount: Number(v.amount || 0),
        paymentMethod: formatPaymentMethodLabel(v.payment_method, merged),
        paymentDetail: formatPaymentDetailLabel(v.payment_detail_id, merged, v.import_kind_text, v.memo),
        staff: v.staff_name || '不明',
        memo: v.memo || '',
      })),
      ...(products || []).map((p: ProductRow) => ({
        id: p.id,
        date: p.sale_date,
        type: 'product' as const,
        name: p.product_name || '不明',
        amount: Number(p.amount || 0),
        unitPrice: Number(p.quantity || 0) > 0 ? Number(p.amount || 0) / Number(p.quantity || 1) : undefined,
        paymentMethod: formatPaymentMethodLabel(p.payment_method, merged),
        staff: p.staff_name || '不明',
        memo: p.memo || '',
        quantity: p.quantity,
      })),
      ...(subscriptions || []).map((s: SubRow) => ({
        id: s.id,
        date: s.start_date,
        type: 'subscription' as const,
        name: s.subscription_name || '不明',
        amount: Number(s.amount || 0),
        paymentMethod: formatPaymentMethodLabel(s.payment_method, merged),
        staff: s.staff_name || '不明',
        memo: s.memo || '',
      })),
    ];

    allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setHistory(allRecords);

    const visitTotal = allRecords.filter((r) => r.type === 'visit').reduce((sum, r) => sum + r.amount, 0);
    const productTotal = allRecords.filter((r) => r.type === 'product').reduce((sum, r) => sum + r.amount, 0);
    const subscriptionTotal = allRecords.filter((r) => r.type === 'subscription').reduce((sum, r) => sum + r.amount, 0);
    const totalSpent = visitTotal + productTotal + subscriptionTotal;
    const visitCount = allRecords.filter((r) => r.type === 'visit').length;
    const lastVisitDate = allRecords[0]?.date || '';
    const daysSince = lastVisitDate
      ? Math.floor((new Date().getTime() - new Date(lastVisitDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    setStats({
      totalVisits: visitCount,
      totalSpent,
      visitTotal,
      productTotal,
      subscriptionTotal,
      avgSpending: visitCount > 0 ? visitTotal / visitCount : 0,
      lastVisit: lastVisitDate,
      daysSinceLastVisit: daysSince,
    });

    setLoading(false);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'visit':
        return <Calendar className="text-blue-500" size={20} />;
      case 'product':
        return <ShoppingBag className="text-orange-500" size={20} />;
      case 'subscription':
        return <CreditCard className="text-purple-500" size={20} />;
      default:
        return <FileText className="text-gray-500" size={20} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'visit':
        return '来院';
      case 'product':
        return '物販';
      case 'subscription':
        return 'サブスク';
      default:
        return '不明';
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'visit':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'product':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'subscription':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">個人通院カルテ</h2>
            <p className="text-indigo-100 text-lg mt-1">
              {customer.name} ({customer.name_kana})
            </p>
            <p className="text-indigo-200 text-sm mt-1 flex items-center gap-1 flex-wrap">
              院: <ClinicNameFromCustomer customer={customer} emptyLabel="—" />
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-all"
          >
            <X size={28} />
          </button>
        </div>

        <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="mb-4 bg-gradient-to-r from-green-600 to-teal-600 rounded-xl p-6 shadow-xl text-white">
            <div className="text-sm font-bold mb-2">総LTV（生涯顧客価値）</div>
            <div className="text-4xl font-bold mb-4">¥{stats.totalSpent.toLocaleString()}</div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="opacity-80">整体施術</div>
                <div className="text-xl font-bold">¥{stats.visitTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="opacity-80">物販</div>
                <div className="text-xl font-bold">¥{stats.productTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="opacity-80">サブスク</div>
                <div className="text-xl font-bold">¥{stats.subscriptionTotal.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-md border-2 border-blue-200">
              <div className="text-xs text-blue-600 font-bold mb-1">来院回数</div>
              <div className="text-2xl font-bold text-blue-900">{stats.totalVisits}回</div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-md border-2 border-purple-200">
              <div className="text-xs text-purple-600 font-bold mb-1">平均単価</div>
              <div className="text-2xl font-bold text-purple-900">
                ¥{Math.floor(stats.avgSpending).toLocaleString()}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-md border-2 border-orange-200">
              <div className="text-xs text-orange-600 font-bold mb-1">最終来院</div>
              <div className="text-sm font-bold text-orange-900">
                {stats.lastVisit ? new Date(stats.lastVisit).toLocaleDateString('ja-JP') : '-'}
              </div>
            </div>

            <div
              className={`rounded-xl p-4 shadow-md border-2 ${
                stats.daysSinceLastVisit > 60
                  ? 'bg-red-100 border-red-300'
                  : stats.daysSinceLastVisit > 30
                  ? 'bg-yellow-100 border-yellow-300'
                  : 'bg-green-100 border-green-300'
              }`}
            >
              <div className="text-xs font-bold mb-1 flex items-center gap-1">
                {stats.daysSinceLastVisit > 30 && <AlertCircle size={14} />}
                経過日数
              </div>
              <div
                className={`text-2xl font-bold ${
                  stats.daysSinceLastVisit > 60
                    ? 'text-red-900'
                    : stats.daysSinceLastVisit > 30
                    ? 'text-yellow-900'
                    : 'text-green-900'
                }`}
              >
                {stats.daysSinceLastVisit}日
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText size={24} />
            全履歴（時系列）
          </h3>

          {loading ? (
            <div className="text-center py-12 text-gray-500">読み込み中...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">履歴がありません</div>
          ) : (
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="bg-white rounded-xl border-2 border-gray-200 p-5 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div>{getTypeIcon(record.type)}</div>
                      <div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold border ${getTypeBadgeColor(
                            record.type
                          )}`}
                        >
                          {getTypeLabel(record.type)}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 font-bold">
                      {new Date(record.date).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 rounded-lg p-4">
                    <div>
                      <div className="text-xs text-gray-500 font-bold mb-1">メニュー・商品</div>
                      <div className="text-base font-bold text-gray-900">
                        {record.name}
                        {record.quantity && (
                          <span className="text-sm text-gray-600 ml-2">x {record.quantity}</span>
                        )}
                        {record.type === 'product' && typeof record.unitPrice === 'number' && (
                          <span className="text-sm text-gray-500 ml-2">
                            （単価 ¥{Math.round(record.unitPrice).toLocaleString()}）
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 font-bold mb-1">担当者</div>
                      <div className="flex items-center gap-1 text-base text-gray-900">
                        <User size={16} />
                        <span className="font-bold">{record.staff}</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 font-bold mb-1">支払方法</div>
                      <div className="flex items-center gap-1 text-base text-gray-900">
                        <CreditCard size={16} />
                        <span className="font-bold">{record.paymentMethod}</span>
                      </div>
                    </div>

                    {record.type === 'visit' && (
                      <div>
                        <div className="text-xs text-gray-500 font-bold mb-1">種類</div>
                        <div className="text-base font-bold text-gray-900">{record.paymentDetail || '-'}</div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div>
                      {record.memo && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded text-sm text-gray-700">
                          <span className="font-bold text-yellow-700">申し送り: </span>
                          {record.memo}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 font-bold mb-1">金額</div>
                      <div className="text-3xl font-bold text-green-700">
                        ¥{record.amount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
