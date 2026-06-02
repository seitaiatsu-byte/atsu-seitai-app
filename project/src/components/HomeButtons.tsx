import { Calendar, ShoppingBag, Repeat } from 'lucide-react';

interface HomeButtonsProps {
  onVisitClick: () => void;
  onProductClick: () => void;
  onSubscriptionClick: () => void;
}

export default function HomeButtons({ onVisitClick, onProductClick, onSubscriptionClick }: HomeButtonsProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 md:p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-3 text-center">入力メニュー</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={onVisitClick}
          className="group bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl p-6 shadow-lg transform hover:scale-[1.02] transition-all flex flex-col items-center justify-center gap-2"
        >
          <Calendar size={48} className="group-hover:scale-110 transition-transform" />
          <span className="text-xl font-bold">来院入力</span>
          <span className="text-xs opacity-90">施術記録を登録</span>
        </button>

        <button
          type="button"
          onClick={onProductClick}
          className="group bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl p-6 shadow-lg transform hover:scale-[1.02] transition-all flex flex-col items-center justify-center gap-2"
        >
          <ShoppingBag size={48} className="group-hover:scale-110 transition-transform" />
          <span className="text-xl font-bold">物販入力</span>
          <span className="text-xs opacity-90">商品販売を登録</span>
        </button>

        <button
          type="button"
          onClick={onSubscriptionClick}
          className="group bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-2xl p-6 shadow-lg transform hover:scale-[1.02] transition-all flex flex-col items-center justify-center gap-2"
        >
          <Repeat size={48} className="group-hover:scale-110 transition-transform" />
          <span className="text-xl font-bold">サブスク入力</span>
          <span className="text-xs opacity-90">定期契約を登録</span>
        </button>
      </div>
    </div>
  );
}
