import { useState } from 'react';
import { Home, Settings as SettingsIcon, BarChart3, AlertCircle, FileText } from 'lucide-react';
import HomeButtons from './components/HomeButtons';
import VisitForm from './components/VisitForm';
import ProductSaleForm from './components/ProductSaleForm';
import SubscriptionForm from './components/SubscriptionForm';
import RepeatAnalysis from './components/RepeatAnalysis';
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

function App() {
  const [currentTab, setCurrentTab] = useState<'home' | 'reports' | 'alerts' | 'chart' | 'settings'>('home');
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(false);
  const [reportsClinic, setReportsClinic] = useState<ClinicScope>('all');
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const goHome = () => {
    setCurrentTab('home');
    setShowVisitForm(false);
    setShowProductForm(false);
    setShowSubscriptionForm(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24">
      {currentTab === 'home' && !showVisitForm && !showProductForm && !showSubscriptionForm && (
        <>
          <PageHeader title="あつ整体院・TOP" onBack={goHome} hideBack />
          <HomeButtons
            onVisitClick={() => setShowVisitForm(true)}
            onProductClick={() => setShowProductForm(true)}
            onSubscriptionClick={() => setShowSubscriptionForm(true)}
          />
        </>
      )}

      {currentTab === 'home' && showVisitForm && (
        <div className="max-w-4xl mx-auto p-4 pt-2">
          <PageHeader title="来院入力" onBack={goHome} />
          <VisitForm onSuccess={goHome} />
        </div>
      )}

      {currentTab === 'home' && showProductForm && (
        <div className="max-w-4xl mx-auto p-4 pt-2">
          <PageHeader title="物販入力" onBack={goHome} />
          <ProductSaleForm onSuccess={goHome} />
        </div>
      )}

      {currentTab === 'home' && showSubscriptionForm && (
        <div className="max-w-4xl mx-auto p-4 pt-2">
          <PageHeader title="サブスク入力" onBack={goHome} />
          <SubscriptionForm onSuccess={goHome} />
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

      {currentTab === 'alerts' && (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          <PageHeader title="アラート" onBack={goHome} />
          <InactivePatientAlerts />
        </div>
      )}

      {currentTab === 'chart' && (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          <PageHeader title="個人カルテ" onBack={goHome} />
          <IndividualChart />
        </div>
      )}

      {currentTab === 'settings' && (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
          <PageHeader
            title="設定"
            onBack={goHome}
            right={
              <button
                type="button"
                onClick={() => setShowNewCustomer(true)}
                className="text-sm font-bold px-3 py-2 rounded-lg bg-blue-600 text-white shadow"
              >
                顧客登録
              </button>
            }
          />
          <BusinessRulesConfig />
          <MasterManagement />
          <CustomerImport />
          <VisitRecordColumnSettings />
          <VisitCsvImport />
          <RepeatAnalysis />
        </div>
      )}

      {showNewCustomer && (
        <NewCustomerForm
          onClose={() => setShowNewCustomer(false)}
          onSuccess={() => {
            setShowNewCustomer(false);
          }}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-lg z-50">
        <div className="max-w-7xl mx-auto flex">
          <button
            type="button"
            onClick={() => {
              setCurrentTab('home');
              setShowVisitForm(false);
              setShowProductForm(false);
              setShowSubscriptionForm(false);
            }}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'home' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Home size={24} />
            <span className="text-xs font-bold mt-1">ホーム</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('reports')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'reports' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <BarChart3 size={24} />
            <span className="text-xs font-bold mt-1">日報月報</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('alerts')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'alerts' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertCircle size={24} />
            <span className="text-xs font-bold mt-1">アラート</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('chart')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'chart' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText size={24} />
            <span className="text-xs font-bold mt-1">個人カルテ</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('settings')}
            className={`flex-1 py-3 flex flex-col items-center justify-center transition-colors ${
              currentTab === 'settings' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SettingsIcon size={24} />
            <span className="text-xs font-bold mt-1">設定</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;
