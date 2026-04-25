import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  bucketStoredPaymentMethod,
  mergeIdNameMaps,
  type PaymentMethodBucket,
} from '../lib/paymentDisplay';

type PaymentBuckets = Record<PaymentMethodBucket, number>;

const emptyBuckets = (): PaymentBuckets => ({ cash: 0, card: 0, paypay: 0, other: 0 });

const addRowAmounts = (
  rows: { payment_method: string | null; amount: number | null }[] | null,
  methodMap: Record<string, string>
): PaymentBuckets => {
  const t = emptyBuckets();
  for (const r of rows || []) {
    const b = bucketStoredPaymentMethod(r.payment_method, methodMap);
    t[b] += Number(r.amount || 0);
  }
  return t;
};

const sumBuckets = (a: PaymentBuckets, b: PaymentBuckets, c: PaymentBuckets): PaymentBuckets => ({
  cash: a.cash + b.cash + c.cash,
  card: a.card + b.card + c.card,
  paypay: a.paypay + b.paypay + c.paypay,
  other: a.other + b.other + c.other,
});

const totalOf = (b: PaymentBuckets) => b.cash + b.card + b.paypay + b.other;

interface SalesData {
  visit: PaymentBuckets;
  product: PaymentBuckets;
  subscription: PaymentBuckets;
}

export default function Dashboard() {
  const [salesData, setSalesData] = useState<SalesData>({
    visit: emptyBuckets(),
    product: emptyBuckets(),
    subscription: emptyBuckets(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    loadSalesData();
  }, []);

  const loadSalesData = async () => {
    setIsLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [{ data: pm }, { data: pd }, { data: visitData }, { data: productData }, { data: subscriptionData }] =
      await Promise.all([
        supabase.from('payment_method_master').select('id,name'),
        supabase.from('payment_detail_master').select('id,name'),
        supabase.from('visit_records').select('payment_method, amount').eq('visit_date', today),
        supabase.from('product_sales').select('payment_method, amount').eq('sale_date', today),
        supabase.from('subscription_records').select('payment_method, amount').eq('start_date', today),
      ]);

    const methodMap = mergeIdNameMaps(pm as { id: string; name: string }[], pd as { id: string; name: string }[]);

    setSalesData({
      visit: addRowAmounts(visitData, methodMap),
      product: addRowAmounts(productData, methodMap),
      subscription: addRowAmounts(subscriptionData, methodMap),
    });

    setLastUpdated(new Date());
    setIsLoading(false);
  };

  const dayTotal = sumBuckets(salesData.visit, salesData.product, salesData.subscription);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-blue-600" size={28} />
          <h2 className="text-2xl font-bold text-gray-800">本日の売上</h2>
        </div>
        <button
          onClick={loadSalesData}
          disabled={isLoading}
          className="p-2 bg-white rounded-lg shadow hover:shadow-md transition-all disabled:opacity-50"
        >
          <RefreshCw className={`text-blue-600 ${isLoading ? 'animate-spin' : ''}`} size={24} />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-green-500 text-white rounded-xl p-4 shadow-lg">
          <div className="text-sm font-bold mb-1">現金</div>
          <div className="text-2xl font-bold">¥{dayTotal.cash.toLocaleString()}</div>
        </div>
        <div className="bg-blue-500 text-white rounded-xl p-4 shadow-lg">
          <div className="text-sm font-bold mb-1">クレジット</div>
          <div className="text-2xl font-bold">¥{dayTotal.card.toLocaleString()}</div>
        </div>
        <div className="bg-indigo-500 text-white rounded-xl p-4 shadow-lg">
          <div className="text-sm font-bold mb-1">PayPay</div>
          <div className="text-2xl font-bold">¥{dayTotal.paypay.toLocaleString()}</div>
        </div>
        <div className="bg-slate-500 text-white rounded-xl p-4 shadow-lg">
          <div className="text-sm font-bold mb-1">その他</div>
          <div className="text-2xl font-bold">¥{dayTotal.other.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl p-6 shadow-xl mb-6">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign size={28} />
          <div className="text-lg font-bold">合計売上</div>
        </div>
        <div className="text-5xl font-bold">¥{totalOf(dayTotal).toLocaleString()}</div>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="font-bold text-blue-600 mb-2">来院</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span>現金: ¥{salesData.visit.cash.toLocaleString()}</span>
            <span>クレジット: ¥{salesData.visit.card.toLocaleString()}</span>
            <span>PayPay: ¥{salesData.visit.paypay.toLocaleString()}</span>
            <span>その他: ¥{salesData.visit.other.toLocaleString()}</span>
          </div>
          <div className="text-right font-bold mt-1">計: ¥{totalOf(salesData.visit).toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <div className="font-bold text-orange-600 mb-2">物販</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span>現金: ¥{salesData.product.cash.toLocaleString()}</span>
            <span>クレジット: ¥{salesData.product.card.toLocaleString()}</span>
            <span>PayPay: ¥{salesData.product.paypay.toLocaleString()}</span>
            <span>その他: ¥{salesData.product.other.toLocaleString()}</span>
          </div>
          <div className="text-right font-bold mt-1">計: ¥{totalOf(salesData.product).toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <div className="font-bold text-purple-600 mb-2">サブスク</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span>現金: ¥{salesData.subscription.cash.toLocaleString()}</span>
            <span>クレジット: ¥{salesData.subscription.card.toLocaleString()}</span>
            <span>PayPay: ¥{salesData.subscription.paypay.toLocaleString()}</span>
            <span>その他: ¥{salesData.subscription.other.toLocaleString()}</span>
          </div>
          <div className="text-right font-bold mt-1">計: ¥{totalOf(salesData.subscription).toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        最終更新: {lastUpdated.toLocaleTimeString('ja-JP')}
      </div>
    </div>
  );
}
