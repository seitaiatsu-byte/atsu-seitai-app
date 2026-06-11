import { useState } from 'react';
import { Home, Settings as SettingsIcon, BarChart3, AlertCircle, FileText, DollarSign } from 'lucide-react';
import { isSupabaseConfigured } from './lib/supabase';
import HomeButtons from './components/HomeButtons';
import ReservationCalendar, {
  type NewPatientFromPlaceholderPayload,
  type VisitFromReservationPayload,
} from './components/ReservationCalendar';
import type { CustomerRow } from './components/CustomerSearchPanel';
import { transferReservationCustomer } from './lib/appointmentReservations';
import { toErrorMessage } from './lib/toErrorMessage';
import type { Database } from './lib/database.types';
import VisitForm from './components/VisitForm';
import ProductSaleForm from './components/ProductSaleForm';
import SubscriptionForm from './components/SubscriptionForm';
import MasterManagement from './components/MasterManagement';
import CustomerImport from './components/CustomerImport';
import ReportsAnalytics from './components/ReportsAnalytics';
import InactivePatientAlerts from './components/InactivePatientAlerts';
import LTVRanking from './components/LTVRanking';
import BusinessRulesConfig from './components/BusinessRulesConfig';
import RegionalAnalysis from './components/RegionalAnalysis';
import IndividualChart from './components/IndividualChart';
import DetailedAnalytics from './components/DetailedAnalytics';
import VisitCsvImport from './components/VisitCsvImport';
import VisitRecordColumnSettings from './components/VisitRecordColumnSettings';
import PageHeader from './components/PageHeader';
import ClinicScopeToggle, { type ClinicScope } from './components/ClinicScopeToggle';
import NewCustomerForm from './components/NewCustomerForm';
import SalesAggregationDashboard from './components/SalesAggregationDashboard';
import { useJapaneseTextInputs } from './lib/useJapaneseTextInputs';
import { guardNavigation } from './lib/unsavedFormGuard';

const __GIT_SHA__ = 'build-20260425';

function App() {
  useJapaneseTextInputs();
  const [currentTab, setCurrentTab] = useState<'home' | 'reports' | 'analysis' | 'alerts' | 'chart' | 'settings'>('home');
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(false);
  const [reportsClinic, setReportsClinic] = useState<ClinicScope>('all');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [placeholderVisitFlow, setPlaceholderVisitFlow] = useState<NewPatientFromPlaceholderPayload | null>(
    null
  );
  const [visitSeed, setVisitSeed] = useState<VisitFromReservationPayload | null>(null);
  const [chartSeedCustomer, setChartSeedCustomer] = useState<CustomerRow | null>(null);
  const [chartDetailOpen, setChartDetailOpen] = useState(false);
  const [chartBackSignal, setChartBackSignal] = useState(0);
  const [chartFromCalendar, setChartFromCalendar] = useState(false);

  const handleNewPatientRegisteredFromPlaceholder = async (
    customer: Database['public']['Tables']['customers']['Row']
  ) => {
    if (!placeholderVisitFlow) return;
    const flow = placeholderVisitFlow;
    try {
      await transferReservationCustomer(flow.reservationId, customer.id);
    } catch (err) {
      alert(`予約の引き継ぎに失敗しました: ${toErrorMessage(err)}`);
      return;
    }
    setPlaceholderVisitFlow(null);
    guardNavigation(() => {
      setVisitSeed({
        customer: customer as CustomerRow,
        visitDate: flow.visitDate,
        reservationId: flow.reservationId,
      });
      setShowVisitForm(true);
    });
  };

  const goHome = () => {
    setCurrentTab('home');
    setShowVisitForm(false);
    setShowProductForm(false);
    setShowSubscriptionForm(false);
    setVisitSeed(null);
  };

  const switchTab = (tab: typeof currentTab) => {
    guardNavigation(() => {
      setCurrentTab(tab);
      if (tab !== 'home') {
        setShowVisitForm(false);
        setShowProductForm(false);
        setShowSubscriptionForm(false);
      }
      if (tab === 'chart') {
        setChartFromCalendar(false);
      }
    });
  };

  const handleChartBack = () => {
    if (chartDetailOpen) {
      setChartSeedCustomer(null);
      setChartBackSignal((n) => n + 1);
      setChartDetailOpen(false);
      if (chartFromCalendar) {
        setChartFromCalendar(false);
        goHome();
      }
      return;
    }
    goHome();
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="max-w-lg w-full rounded-2xl border-2 border-amber-200 bg-white p-6 shadow-lg text-slate-800">
          <h1 className="text-xl font-bold text-amber-800 mb-3">Supabase の接続先が未設定です</h1>
          <p className="text-sm mb-3">
            本番では次の 2 つを <strong>Vercel</strong> の環境変数に入れ、<strong>再デプロイ</strong>してください。値は Supabase
            の Project Settings → API から取得できます。
          </p>
          <ul className="text-sm font-mono space-y-1 bg-slate-50 p-3 rounded-lg mb-4 break-all">
            <li>VITE_SUPABASE_URL</li>
            <li>VITE_SUPABASE_ANON_KEY</li>
          </ul>
          <p className="text-xs text-slate-600">
            手順: Vercel ダッシュボード → このプロジェクト → Settings → Environment Variables
            → Production（必要なら Preview も）に上記を追加 → Deployments から Redeploy。
            ローカルでは <code className="bg-slate-100 px-1 rounded">project/.env</code> に同じ変数名で保存します。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24">
      {currentTab === 'home' && !showVisitForm && !showProductForm && !showSubscriptionForm && (
        <div className="max-w-7xl mx-auto p-4 max-sm:p-1 max-sm:pb-0 space-y-4 max-sm:space-y-0">
          <PageHeader title="あつ整体院・TOP" onBack={goHome} hideBack mobileMinimal />
          <ReservationCalendar
            onOpenVisitWithReservation={(payload) => {
              guardNavigation(() => {
                setVisitSeed(payload);
                setShowVisitForm(true);
              });
            }}
            onOpenNewPatientFromPlaceholder={(payload) => {
              guardNavigation(() => {
                setPlaceholderVisitFlow(payload);
              });
            }}
            onOpenCustomerChart={(customer) => {
              guardNavigation(() => {
                setChartSeedCustomer(customer);
                setChartFromCalendar(true);
                setChartDetailOpen(true);
                setShowVisitForm(false);
                setShowProductForm(false);
                setShowSubscriptionForm(false);
                setCurrentTab('chart');
              });
            }}
          />
          <HomeButtons
            onVisitClick={() => {
              guardNavigation(() => {
                setVisitSeed(null);
                setShowVisitForm(true);
              });
            }}
            onProductClick={() => guardNavigation(() => setShowProductForm(true))}
            onSubscriptionClick={() => guardNavigation(() => setShowSubscriptionForm(true))}
          />
        </div>
      )}

      {currentTab === 'home' && showVisitForm && (
        <div className="max-w-4xl mx-auto p-4 pt-2">
          <PageHeader title="来院入力" onBack={goHome} />
          <VisitForm
            initialCustomer={visitSeed?.customer ?? null}
            initialVisitDate={visitSeed?.visitDate}
            linkedReservationId={visitSeed?.reservationId ?? null}
            onVisitSeedConsumed={() => setVisitSeed(null)}
          />
        </div>
      )}

      {currentTab === 'home' && showProductForm && (
        <div className="max-w-4xl mx-auto p-4 pt-2">
          <PageHeader title="物販入力" onBack={goHome} />
          <ProductSaleForm />
        </div>
      )}

      {currentTab === 'home' && showSubscriptionForm && (
        <div className="max-w-4xl mx-auto p-4 pt-2">
          <PageHeader title="サブスク入力" onBack={goHome} />
          <SubscriptionForm />
        </div>
      )}

      {currentTab === 'reports' && (
        <div className="max-w-7xl mx-auto p-4 space-y-4">
          <PageHeader title="日報・月報" onBack={goHome} />
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl p-4 shadow border border-gray-100">
            <ClinicScopeToggle value={reportsClinic} onChange={setReportsClinic} />
          </div>
          <ReportsAnalytics clinicScope={reportsClinic} />
          <LTVRanking clinicScope={reportsClinic} />
          <RegionalAnalysis clinicScope={reportsClinic} />
          <DetailedAnalytics clinicScope={reportsClinic} />
        </div>
      )}

      {currentTab === 'analysis' && (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          <PageHeader title="売上集計・分析" onBack={goHome} />
          <SalesAggregationDashboard />
        </div>
      )}

      {currentTab === 'alerts' && (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          <PageHeader title="アラート" onBack={goHome} />
          <InactivePatientAlerts />
        </div>
      )}

      {currentTab === 'chart' && (
        <div className="max-w-7xl mx-auto p-4 max-sm:p-2 space-y-4 max-sm:space-y-2">
          <PageHeader title="個人カルテ" onBack={handleChartBack} />
          <IndividualChart
            initialCustomer={chartSeedCustomer}
            backToListSignal={chartBackSignal}
            onDetailChange={setChartDetailOpen}
          />
        </div>
      )}

      {currentTab === 'settings' && (
        <div className="max-w-7xl mx-auto p-4 max-sm:p-2 space-y-6 max-sm:space-y-4">
          <PageHeader
            title="設定"
            onBack={goHome}
            right={
              <button
                type="button"
                onClick={() => guardNavigation(() => setShowNewCustomer(true))}
                className="text-sm font-bold px-3 py-2 rounded-lg bg-blue-600 text-white shadow"
              >
                顧客登録
              </button>
            }
          />
          <CustomerImport />
          <MasterManagement />
          <BusinessRulesConfig />
          <VisitRecordColumnSettings />
          <VisitCsvImport />
        </div>
      )}

      {showNewCustomer && (
        <NewCustomerForm
          onClose={() => guardNavigation(() => setShowNewCustomer(false))}
        />
      )}

      {placeholderVisitFlow && (
        <NewCustomerForm
          title="仮予約から新規患者登録"
          requireManualCustomerNumber
          initialMemo={placeholderVisitFlow.reservationMemo ?? ''}
          onClose={() => guardNavigation(() => setPlaceholderVisitFlow(null))}
          onSuccess={(customer) => void handleNewPatientRegisteredFromPlaceholder(customer)}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-lg z-50">
        <div className="max-w-7xl mx-auto flex">
          <button
            type="button"
            onClick={() => switchTab('home')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'home' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Home size={24} />
            <span className="text-xs font-bold mt-1">ホーム</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('reports')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'reports' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <BarChart3 size={24} />
            <span className="text-xs font-bold mt-1">日報月報</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('alerts')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'alerts' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertCircle size={24} />
            <span className="text-xs font-bold mt-1">アラート</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('analysis')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'analysis' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <DollarSign size={24} />
            <span className="text-xs font-bold mt-1">集計分析</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('chart')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'chart' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText size={24} />
            <span className="text-xs font-bold mt-1">個人カルテ</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('settings')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'settings' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SettingsIcon size={24} />
            <span className="text-xs font-bold mt-1">設定</span>
          </button>
        </div>
        <div className="absolute right-2 -top-5 text-[10px] text-gray-400 font-mono">{__GIT_SHA__}</div>
      </nav>
    </div>
  );
}

export default App;
