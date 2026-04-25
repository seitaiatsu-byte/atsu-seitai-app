import { Calendar, ShoppingBag, Repeat } from 'lucide-react';

interface HomeButtonsProps {
  onVisitClick: () => void;
  onProductClick: () => void;
  onSubscriptionClick: () => void;
}

export default function HomeButtons({ onVisitClick, onProductClick, onSubscriptionClick }: HomeButtonsProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">あつ整体院管理システム</h1>
          <p className="text-lg text-gray-600">入力メニューを選択してください</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={onVisitClick}
            className="group bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-3xl p-12 shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200 flex flex-col items-center justify-center space-y-4"
          >
            <Calendar size={80} className="group-hover:scale-110 transition-transform" />
            <span className="text-3xl font-bold">来院入力</span>
            <span className="text-sm opacity-90">施術記録を登録</span>
          </button>

          <button
            onClick={onProductClick}
            className="group bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-3xl p-12 shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200 flex flex-col items-center justify-center space-y-4"
          >
            <ShoppingBag size={80} className="group-hover:scale-110 transition-transform" />
            <span className="text-3xl font-bold">物販入力</span>
            <span className="text-sm opacity-90">商品販売を登録</span>
          </button>

          <button
            onClick={onSubscriptionClick}
            className="group bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-3xl p-12 shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-200 flex flex-col items-center justify-center space-y-4"
          >
            <Repeat size={80} className="group-hover:scale-110 transition-transform" />
            <span className="text-3xl font-bold">サブスク入力</span>
            <span className="text-sm opacity-90">定期契約を登録</span>
          </button>
        </div>

        <div className="text-center mt-8 text-gray-500 text-sm">
          ボタンを押すと入力画面が開きます
        </div>
      </div>
    </div>
  );
}
