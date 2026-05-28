import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, Phone, Cake, UserCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { getCustomerBirthDate, calculateAge } from '../lib/customerBirthday';
import {
  type AlertFollowConfig,
  DEFAULT_ALERT_FOLLOW,
  fetchAlertFollowConfig,
  labelActiveShort,
  labelOrangeRange,
  labelRedRange,
  labelYellowRange,
} from '../lib/alertFollowConfig';

type Customer = Database['public']['Tables']['customers']['Row'];

interface InactiveRow {
  customer: Customer;
  daysSince: number;
  lastVisitDate: string;
  visitCount: number;
  ltvApprox: number;
}

/** 誕生日一覧の色分け境界（日数） */
const BDAY_VISIT_3M = 90;
const BDAY_VISIT_6M = 180;
const BDAY_VISIT_1Y = 365;
const BDAY_VISIT_MAX = 548; // 約1年半（365 + 183）

interface BirthdayRow {
  customer: Customer;
  birthDate: string;
  displayAge: number;
  dayOfMonth: number;
  /** 最終来院からの日数。来院履歴が無い／未インポートは null */
  daysSinceLastVisit: number | null;
}

function birthdayRowCardClass(daysSinceLastVisit: number | null): string {
  if (daysSinceLastVisit == null) return 'bg-gray-50 border-gray-200';
  if (daysSinceLastVisit <= BDAY_VISIT_3M) {
    return 'bg-blue-50 border-blue-400';
  }
  if (daysSinceLastVisit <= BDAY_VISIT_6M) {
    return 'bg-orange-50 border-orange-300';
  }
  if (daysSinceLastVisit <= BDAY_VISIT_1Y) {
    return 'bg-yellow-50 border-yellow-300';
  }
  if (daysSinceLastVisit <= BDAY_VISIT_MAX) return 'bg-pink-50 border-pink-200';
  return 'bg-gray-50 border-gray-200';
}

function lastVisitPerCustomer(visits: { customer_id: string; visit_date: string; amount?: number | null }[]) {
  const map = new Map<string, { date: string; count: number; sum: number }>();
  visits.forEach((v) => {
    const cur = map.get(v.customer_id);
    const amt = Number(v.amount || 0);
    if (!cur) {
      map.set(v.customer_id, { date: v.visit_date, count: 1, sum: amt });
    } else {
      cur.count++;
      cur.sum += amt;
      if (v.visit_date > cur.date) cur.date = v.visit_date;
    }
  });
  return map;
}

export default function InactivePatientAlerts() {
  const [cfg, setCfg] = useState<AlertFollowConfig>(DEFAULT_ALERT_FOLLOW);
  const [b1, setB1] = useState<InactiveRow[]>([]);
  const [b2, setB2] = useState<InactiveRow[]>([]);
  const [b3, setB3] = useState<InactiveRow[]>([]);
  const [birthThis, setBirthThis] = useState<BirthdayRow[]>([]);
  const [birthNext, setBirthNext] = useState<BirthdayRow[]>([]);
  const [activeMembers, setActiveMembers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [redUpperDays, setRedUpperDays] = useState(365);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    const followCfg = await fetchAlertFollowConfig();
    setCfg(followCfg);

    const { data: customers } = await supabase.from('customers').select('*');
    const { data: visits } = await supabase.from('visit_records').select('customer_id, visit_date, amount');
    const { data: products } = await supabase.from('product_sales').select('customer_id, amount');
    const { data: subs } = await supabase.from('subscription_records').select('customer_id, amount');

    const visitMap = lastVisitPerCustomer(visits || []);

    const ltv = new Map<string, number>();
    (visits || []).forEach((v) => ltv.set(v.customer_id, (ltv.get(v.customer_id) || 0) + Number(v.amount || 0)));
    (products || []).forEach((p) => ltv.set(p.customer_id, (ltv.get(p.customer_id) || 0) + Number(p.amount || 0)));
    (subs || []).forEach((s) => ltv.set(s.customer_id, (ltv.get(s.customer_id) || 0) + Number(s.amount || 0)));

    const bucket1: InactiveRow[] = [];
    const bucket2: InactiveRow[] = [];
    const bucket3: InactiveRow[] = [];
    const active: Customer[] = [];
    const a = followCfg.activeMaxExclusive;
    const t1 = followCfg.tier1End;
    const t2 = followCfg.tier2End;

    for (const c of customers || []) {
      const vi = visitMap.get(c.id);
      if (vi) {
        const last = new Date(vi.date);
        const daysSince = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince < a) {
          active.push(c);
        }
        if (daysSince >= a && daysSince < t1) {
          bucket1.push({
            customer: c,
            daysSince,
            lastVisitDate: vi.date,
            visitCount: vi.count,
            ltvApprox: ltv.get(c.id) || vi.sum,
          });
        } else if (daysSince >= t1 && daysSince < t2) {
          bucket2.push({
            customer: c,
            daysSince,
            lastVisitDate: vi.date,
            visitCount: vi.count,
            ltvApprox: ltv.get(c.id) || vi.sum,
          });
        } else if (daysSince >= t2) {
          bucket3.push({
            customer: c,
            daysSince,
            lastVisitDate: vi.date,
            visitCount: vi.count,
            ltvApprox: ltv.get(c.id) || vi.sum,
          });
        }
      }
    }

    bucket1.sort((x, y) => y.daysSince - x.daysSince);
    bucket2.sort((x, y) => y.daysSince - x.daysSince);
    bucket3.sort((x, y) => y.daysSince - x.daysSince);
    active.sort((x, y) => (x.name_kana || '').localeCompare(y.name_kana || ''));

    const thisM = today.getMonth();
    const nextM = (thisM + 1) % 12;
    const thisMonthList: BirthdayRow[] = [];
    const nextMonthList: BirthdayRow[] = [];

    for (const c of customers || []) {
      const bdStr = getCustomerBirthDate(c);
      if (!bdStr) continue;
      const birth = new Date(bdStr);
      if (Number.isNaN(birth.getTime())) continue;
      const bm = birth.getMonth();
      const bdD = birth.getDate();
      const displayAge = calculateAge(bdStr) ?? 0;
      const vi = visitMap.get(c.id);
      const daysSinceLastVisit = vi
        ? Math.floor((today.getTime() - new Date(vi.date).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      // 誕生日一覧は「最終来院が1年半以内」の患者のみ表示する
      if (daysSinceLastVisit == null || daysSinceLastVisit > BDAY_VISIT_MAX) {
        continue;
      }
      if (bm === thisM) {
        thisMonthList.push({
          customer: c,
          birthDate: bdStr,
          displayAge,
          dayOfMonth: bdD,
          daysSinceLastVisit,
        });
      } else if (bm === nextM) {
        nextMonthList.push({
          customer: c,
          birthDate: bdStr,
          displayAge,
          dayOfMonth: bdD,
          daysSinceLastVisit,
        });
      }
    }
    thisMonthList.sort((x, y) => x.dayOfMonth - y.dayOfMonth);
    nextMonthList.sort((x, y) => x.dayOfMonth - y.dayOfMonth);

    setB1(bucket1);
    setB2(bucket2);
    setB3(bucket3);
    setBirthThis(thisMonthList);
    setBirthNext(nextMonthList);
    setActiveMembers(active);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAlerts();
    const interval = setInterval(() => {
      void loadAlerts();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadAlerts();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadAlerts]);

  const t1a = cfg.activeMaxExclusive;
  const t1b = cfg.tier1End;
  const t2b = cfg.tier2End;
  const filteredB3 = useMemo(
    () => b3.filter((row) => row.daysSince >= t2b && row.daysSince <= redUpperDays),
    [b3, t2b, redUpperDays]
  );
  const redRangeTitle = `${t2b}日以上〜${redUpperDays}日以内 未来院`;
  const hasBirth = birthThis.length + birthNext.length > 0;
  const allQuiet =
    b1.length === 0 && b2.length === 0 && filteredB3.length === 0 && !hasBirth;

  const renderBirthdayList = (items: BirthdayRow[]) => (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.customer.id}
          className={`rounded-lg p-4 border-2 transition-colors ${birthdayRowCardClass(item.daysSinceLastVisit)}`}
        >
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <div className="text-lg font-bold text-gray-900">
                {item.customer.name}
                {item.customer.customer_number != null && String(item.customer.customer_number).trim() !== '' && (
                  <span className="ml-2 text-sm font-mono font-semibold text-gray-600">
                    {item.customer.customer_number}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600">{item.customer.name_kana}</div>
              <div className="text-sm mt-1">
                {new Date(item.birthDate).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}（満
                {item.displayAge}歳付近）
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={16} />
              <span className="font-bold">{item.customer.phone_number || '-'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderInactiveList = (title: string, color: string, items: InactiveRow[]) => {
    if (items.length === 0) return null;
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${color}`}>
          <Calendar size={20} />
          {title}（{items.length}名）
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.customer.id}
              className="rounded-lg p-4 border-2 border-gray-200 hover:shadow-md bg-gray-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-bold text-gray-900">{item.customer.name}</div>
                  <div className="text-sm text-gray-600">{item.customer.name_kana}</div>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-700 mt-1">
                    <span className="font-bold">{item.daysSince}日経過</span>
                    <span>最終来院: {new Date(item.lastVisitDate).toLocaleDateString('ja-JP')}</span>
                    <span>来院{item.visitCount}回</span>
                    <span>LTV目安: ¥{Math.round(item.ltvApprox).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="text-gray-600" size={16} />
                  <span className="text-sm font-bold">{item.customer.phone_number || '-'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="text-center py-8 text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="text-red-600" size={28} />
          <h2 className="text-2xl font-bold text-gray-800">アラート・フォロー</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadAlerts()}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          再読み込み
        </button>
      </div>

      <p className="text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        フォロー日数帯（黄・橙・赤・緑の区切りと
        <span className="font-bold text-slate-800"> アクティブの日数</span>）は{' '}
        <span className="font-bold text-blue-700">設定</span>
        内「経営ルール」で変更できます。保存後、ここで「再読み込み」するか約1分待つと反映されます。
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl shadow-lg p-6 border-2 border-yellow-300">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="text-yellow-600" size={22} />
            <h3 className="font-bold text-yellow-900">{labelYellowRange(cfg)}</h3>
          </div>
          <div className="text-4xl font-bold text-yellow-900">{b1.length}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl shadow-lg p-6 border-2 border-orange-300">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="text-orange-600" size={22} />
            <h3 className="font-bold text-orange-900">{labelOrangeRange(cfg)}</h3>
          </div>
          <div className="text-4xl font-bold text-orange-900">{b2.length}</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl shadow-lg p-6 border-2 border-red-300">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-red-600" size={22} />
            <h3 className="font-bold text-red-900">{labelRedRange(cfg)}</h3>
          </div>
          <div className="text-4xl font-bold text-red-900">{b3.length}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl shadow-lg p-6 border-2 border-emerald-300">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="text-emerald-600" size={22} />
            <h3 className="font-bold text-emerald-900">アクティブ（{labelActiveShort(cfg)}に来院）</h3>
          </div>
          <div className="text-4xl font-bold text-emerald-900">{activeMembers.length}</div>
        </div>
      </div>

      {activeMembers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <UserCheck className="text-emerald-600" size={20} />
            アクティブ会員リスト（最終来院の経過が{labelActiveShort(cfg)}）
          </h3>
          <div className="max-h-64 overflow-y-auto divide-y">
            {activeMembers.map((c) => (
              <div key={c.id} className="py-2 flex justify-between text-sm">
                <span className="font-bold">{c.name}</span>
                <span className="text-gray-500">{c.phone_number || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasBirth && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
            <Cake className="text-pink-600" size={20} />
            誕生日（今月・来月、日付の早い順）
          </h3>
          <p className="text-xs text-gray-600 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              枠色＝最終来院からの目安:{' '}
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-200 border border-blue-400 align-middle" />{' '}
              3ヶ月以内
            </span>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-100 border border-orange-300 align-middle" />{' '}
              3ヶ月超〜半年以内
            </span>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-100 border border-yellow-300 align-middle" />{' '}
              半年超〜1年以内
            </span>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-100 border border-pink-200 align-middle" />{' '}
              1年超〜1年半以内
            </span>
          </p>
          <p className="text-xs text-gray-500 mb-4">
            ※ 最終来院から1年半を超える方は、誕生日一覧には表示しません。
          </p>
          {birthThis.length > 0 && (
            <div className="mb-8">
              <h4 className="text-md font-bold text-pink-900 mb-3 border-b-2 border-pink-200 pb-2">今月</h4>
              {renderBirthdayList(birthThis)}
            </div>
          )}
          {birthNext.length > 0 && (
            <div>
              <h4 className="text-md font-bold text-pink-900 mb-3 border-b-2 border-pink-200 pb-2">来月</h4>
              {renderBirthdayList(birthNext)}
            </div>
          )}
        </div>
      )}

      {renderInactiveList(
        `${t1a}日以上〜${t1b - 1}日未満 未来院`,
        'text-yellow-800',
        b1
      )}
      {renderInactiveList(
        `${t1b}日以上〜${t2b - 1}日未満 未来院`,
        'text-orange-800',
        b2
      )}

      <div className="bg-white rounded-2xl shadow-lg p-4 border border-red-200">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-red-800">長期未来院の表示範囲:</span>
          <span className="text-gray-700">{t2b}日以上〜</span>
          <input
            type="number"
            min={t2b}
            value={redUpperDays}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isFinite(n)) return;
              setRedUpperDays(Math.max(t2b, n));
            }}
            className="w-24 px-2 py-1 border rounded-lg font-bold text-right"
          />
          <span className="text-gray-700">日以内</span>
        </div>
      </div>

      {renderInactiveList(
        redRangeTitle,
        'text-red-800',
        filteredB3
      )}

      {allQuiet && (
        <div className="bg-green-50 rounded-2xl shadow-lg p-8 border-2 border-green-200 text-center">
          <div className="text-2xl font-bold text-green-900">離脱帯の来院患者はいません</div>
          <p className="text-green-800 mt-2 text-sm">
            （{labelActiveShort(cfg)}の経過を超えた未来院がいない、または今月・来月の誕生日対象者がいません）
          </p>
        </div>
      )}
    </div>
  );
}
