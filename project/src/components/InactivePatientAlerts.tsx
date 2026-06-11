import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, Cake, UserCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isPlaceholderCustomerNumber } from '../lib/customerNumber';
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
import ChurnRateSummary from './ChurnRateSummary';

type Customer = Database['public']['Tables']['customers']['Row'];

interface InactiveRow {
  customer: Customer;
  daysSince: number;
  lastVisitDate: string;
  visitCount: number;
  ltvApprox: number;
}

interface ActiveRow {
  customer: Customer;
  daysSince: number;
  lastVisitDate: string;
}

const ACTIVE_DAY_MAX = 360;

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

function compactPhone(v: string | null | undefined): string {
  const t = String(v || '').trim();
  return t || '-';
}

function compactYen(n: number): string {
  const v = Math.round(n);
  if (v >= 10000) {
    const man = v / 10000;
    return `¥${Number.isInteger(man) ? man : man.toFixed(1)}万`;
  }
  if (v >= 1000) return `¥${Math.round(v / 1000)}k`;
  return `¥${v.toLocaleString()}`;
}

function shortMd(ymd: string): string {
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
  const [activeMembers, setActiveMembers] = useState<ActiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [redUpperDays, setRedUpperDays] = useState(365);
  const [activeSort, setActiveSort] = useState<{ key: 'days' | 'name' | 'last'; dir: 'asc' | 'desc' }>({
    key: 'days',
    dir: 'asc',
  });

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
    const active: ActiveRow[] = [];
    const a = followCfg.activeMaxExclusive;
    const t1 = followCfg.tier1End;
    const t2 = followCfg.tier2End;

    for (const c of customers || []) {
      if (isPlaceholderCustomerNumber(c.customer_number)) continue;
      const vi = visitMap.get(c.id);
      if (vi) {
        const last = new Date(vi.date);
        const daysSince = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince >= 0 && daysSince <= ACTIVE_DAY_MAX) {
          active.push({
            customer: c,
            daysSince,
            lastVisitDate: vi.date,
          });
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
    active.sort((x, y) => (x.customer.name_kana || '').localeCompare(y.customer.name_kana || ''));

    const thisM = today.getMonth();
    const nextM = (thisM + 1) % 12;
    const thisMonthList: BirthdayRow[] = [];
    const nextMonthList: BirthdayRow[] = [];

    for (const c of customers || []) {
      if (isPlaceholderCustomerNumber(c.customer_number)) continue;
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
  const activeMembersSorted = useMemo(() => {
    const rows = [...activeMembers];
    rows.sort((a, b) => {
      let cmp = 0;
      if (activeSort.key === 'days') cmp = a.daysSince - b.daysSince;
      else if (activeSort.key === 'last') cmp = String(a.lastVisitDate).localeCompare(String(b.lastVisitDate));
      else cmp = String(a.customer.name_kana || a.customer.name || '').localeCompare(String(b.customer.name_kana || b.customer.name || ''), 'ja');
      return activeSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [activeMembers, activeSort]);

  const activeRowColorClass = (daysSince: number) => {
    if (daysSince <= 89) return 'bg-blue-50 border-blue-200';
    if (daysSince <= 119) return 'bg-yellow-50 border-yellow-200';
    if (daysSince <= 179) return 'bg-orange-50 border-orange-200';
    return 'bg-slate-50 border-slate-200';
  };

  const toggleActiveSort = (key: 'days' | 'name' | 'last') => {
    setActiveSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: 'asc' };
    });
  };

  const sortMark = (key: 'days' | 'name' | 'last') =>
    activeSort.key === key ? (activeSort.dir === 'asc' ? '▲' : '▼') : '↕';

  const hasBirth = birthThis.length + birthNext.length > 0;
  const allQuiet =
    b1.length === 0 && b2.length === 0 && filteredB3.length === 0 && !hasBirth;

  const renderBirthdayList = (items: BirthdayRow[]) => (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div
          key={item.customer.id}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 border transition-colors ${birthdayRowCardClass(item.daysSinceLastVisit)}`}
        >
          <span className="shrink-0 w-9 text-[11px] font-bold text-gray-800 tabular-nums">
            {shortMd(item.birthDate)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-900">{item.customer.name}</span>
          <span className="shrink-0 text-[10px] text-gray-700 whitespace-nowrap">満{item.displayAge}歳</span>
          <span className="shrink-0 text-[10px] text-gray-600 max-w-[4.5rem] truncate">{compactPhone(item.customer.phone_number)}</span>
        </div>
      ))}
    </div>
  );

  const renderInactiveList = (title: string, color: string, items: InactiveRow[]) => {
    if (items.length === 0) return null;
    return (
      <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4">
        <h3 className={`text-sm sm:text-base font-bold mb-2 flex items-center gap-1.5 leading-tight ${color}`}>
          <Calendar size={18} className="shrink-0" />
          <span className="min-w-0">{title}（{items.length}名）</span>
        </h3>
        <div className="space-y-0.5 max-sm:max-h-[32rem] max-h-96 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.customer.id}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 border border-gray-200 bg-gray-50"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-900">{item.customer.name}</span>
              <span className="shrink-0 text-[10px] font-bold text-gray-800 whitespace-nowrap">{item.daysSince}日</span>
              <span className="shrink-0 text-[10px] text-gray-600 whitespace-nowrap max-sm:hidden">{shortMd(item.lastVisitDate)}</span>
              <span className="shrink-0 text-[10px] text-gray-600 whitespace-nowrap max-sm:hidden">{item.visitCount}回</span>
              <span className="shrink-0 text-[10px] font-bold text-gray-700 whitespace-nowrap">{compactYen(item.ltvApprox)}</span>
              <span className="shrink-0 text-[10px] text-gray-600 max-w-[4rem] truncate">{compactPhone(item.customer.phone_number)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-3 sm:p-4">
        <div className="text-center py-4 text-sm text-gray-500">読み込み中...</div>
      </div>
    );
  }

  const statCardClass =
    'rounded-lg border shadow-sm px-2 py-1.5 sm:px-2.5 sm:py-2 min-h-0';

  return (
    <div className="space-y-4 sm:space-y-5">
      <ChurnRateSummary />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="text-red-600 shrink-0" size={20} />
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 leading-tight truncate">アラート・フォロー</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadAlerts()}
            className="inline-flex items-center gap-1 shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={14} />
            再読み込み
          </button>
        </div>

        <p className="text-[11px] sm:text-xs leading-snug text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
          日数帯は<span className="font-bold text-blue-700">設定→経営ルール</span>で変更。保存後「再読み込み」または約1分で反映。
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
          <div
            className={`${statCardClass} bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <Calendar className="text-yellow-600 shrink-0" size={14} />
                <h3 className="font-bold text-yellow-900 text-[11px] sm:text-xs truncate leading-tight">
                  {labelYellowRange(cfg)}
                </h3>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-yellow-900 leading-none tabular-nums shrink-0">
                {b1.length}
              </div>
            </div>
          </div>
          <div
            className={`${statCardClass} bg-gradient-to-br from-orange-50 to-orange-100 border-orange-300`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <Calendar className="text-orange-600 shrink-0" size={14} />
                <h3 className="font-bold text-orange-900 text-[11px] sm:text-xs truncate leading-tight">
                  {labelOrangeRange(cfg)}
                </h3>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-orange-900 leading-none tabular-nums shrink-0">
                {b2.length}
              </div>
            </div>
          </div>
          <div className={`${statCardClass} bg-gradient-to-br from-red-50 to-red-100 border-red-300`}>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <AlertCircle className="text-red-600 shrink-0" size={14} />
                <h3 className="font-bold text-red-900 text-[11px] sm:text-xs truncate leading-tight">
                  {labelRedRange(cfg)}
                </h3>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-red-900 leading-none tabular-nums shrink-0">
                {b3.length}
              </div>
            </div>
          </div>
          <div
            className={`${statCardClass} bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <UserCheck className="text-emerald-600 shrink-0" size={14} />
                <h3 className="font-bold text-emerald-900 text-[11px] sm:text-xs truncate leading-tight">
                  アクティブ（0〜{ACTIVE_DAY_MAX}日）
                </h3>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-900 leading-none tabular-nums shrink-0">
                {activeMembers.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeMembers.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4">
          <h3 className="text-sm sm:text-base font-bold text-gray-800 mb-2 flex items-center gap-1.5 leading-tight">
            <UserCheck className="text-emerald-600 shrink-0" size={18} />
            <span className="min-w-0">アクティブ会員（0〜{ACTIVE_DAY_MAX}日）</span>
          </h3>
          <div className="mb-1.5 flex flex-wrap gap-1 text-[10px] sm:text-xs">
            <button
              type="button"
              onClick={() => toggleActiveSort('days')}
              className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-bold text-gray-700"
            >
              日数 {sortMark('days')}
            </button>
            <button
              type="button"
              onClick={() => toggleActiveSort('name')}
              className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-bold text-gray-700"
            >
              氏名 {sortMark('name')}
            </button>
            <button
              type="button"
              onClick={() => toggleActiveSort('last')}
              className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-bold text-gray-700"
            >
              来院日 {sortMark('last')}
            </button>
          </div>
          <div className="max-sm:max-h-[32rem] max-h-64 overflow-y-auto space-y-0.5">
            {activeMembersSorted.map((row) => (
              <div
                key={row.customer.id}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 border ${activeRowColorClass(row.daysSince)}`}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-800">{row.customer.name}</span>
                <span className="shrink-0 text-[10px] font-bold text-gray-700 whitespace-nowrap">{row.daysSince}日</span>
                <span className="shrink-0 text-[10px] text-gray-600 whitespace-nowrap">{shortMd(row.lastVisitDate)}</span>
                <span className="shrink-0 text-[10px] text-gray-600 max-w-[4rem] truncate">{compactPhone(row.customer.phone_number)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasBirth && (
        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4">
          <h3 className="text-sm sm:text-base font-bold text-gray-800 mb-2 flex items-center gap-1.5 leading-tight">
            <Cake className="text-pink-600 shrink-0" size={18} />
            誕生日（今月・来月）
          </h3>
          <p className="text-[10px] sm:text-xs text-gray-600 mb-2 leading-snug">
            枠色＝最終来院: <span className="inline-block w-2 h-2 rounded-sm bg-blue-200 border border-blue-400 align-middle" />3M
            <span className="inline-block w-2 h-2 rounded-sm bg-orange-100 border border-orange-300 align-middle ml-1" />3-6M
            <span className="inline-block w-2 h-2 rounded-sm bg-yellow-100 border border-yellow-300 align-middle ml-1" />6M-1Y
            <span className="inline-block w-2 h-2 rounded-sm bg-pink-100 border border-pink-200 align-middle ml-1" />1-1.5Y
          </p>
          <div className="panel-scrollbar max-sm:max-h-[32rem] max-h-96 overflow-y-auto pr-1">
            {birthThis.length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-bold text-pink-900 mb-1 border-b border-pink-200 pb-0.5">今月</h4>
                {renderBirthdayList(birthThis)}
              </div>
            )}
            {birthNext.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-pink-900 mb-1 border-b border-pink-200 pb-0.5">来月</h4>
                {renderBirthdayList(birthNext)}
              </div>
            )}
          </div>
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

      <div className="bg-white rounded-xl shadow-lg p-3 sm:p-4 border border-red-200">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
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
