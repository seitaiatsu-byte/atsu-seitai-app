import { useState, useEffect } from 'react';
import { Settings, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { type AlertFollowConfig, DEFAULT_ALERT_FOLLOW, fetchAlertFollowConfig } from '../lib/alertFollowConfig';
import AlertFollowRangeEditor from './AlertFollowRangeEditor';

type BusinessRule = {
  id: string;
  rule_key: string;
  rule_value: string;
  description: string | null;
};

export default function BusinessRulesConfig() {
  const [inactiveDays, setInactiveDays] = useState('30');
  const [excludeKeywords, setExcludeKeywords] = useState('BE,初回,体験');
  const [churnLapsedDays, setChurnLapsedDays] = useState('90');
  const [dailyMaxSlots, setDailyMaxSlots] = useState('20');
  const [monthlyAdSpend, setMonthlyAdSpend] = useState('0');
  const [adSourceKeywords, setAdSourceKeywords] = useState('広告,インスタ,instagram,meta,google,line');
  const [menuDurationRules, setMenuDurationRules] = useState('');
  const [defaultTreatmentMinutes, setDefaultTreatmentMinutes] = useState('60');
  const [otherCalendarPassword, setOtherCalendarPassword] = useState('');
  const [alertFollow, setAlertFollow] = useState<AlertFollowConfig>(DEFAULT_ALERT_FOLLOW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showImpactGuide, setShowImpactGuide] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    alertFollow: false,
    inactive: false,
    churn: false,
    slots: false,
    ads: false,
    duration: false,
    exclude: false,
  });

  const togglePanel = (key: string) => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('business_rules')
      .select('*');

    if (data) {
      const inactiveRule = data.find((r: BusinessRule) => r.rule_key === 'inactive_days_threshold');
      const excludeRule = data.find((r: BusinessRule) => r.rule_key === 'exclude_keywords');
      const churnRule = data.find((r: BusinessRule) => r.rule_key === 'churn_lapsed_days');
      const maxSlotsRule = data.find((r: BusinessRule) => r.rule_key === 'daily_max_slots');
      const adSpendRule = data.find((r: BusinessRule) => r.rule_key === 'monthly_ad_spend');
      const adKeywordsRule = data.find((r: BusinessRule) => r.rule_key === 'ad_source_keywords');
      const menuDurationRule = data.find((r: BusinessRule) => r.rule_key === 'menu_duration_rules');
      const defaultMinutesRule = data.find((r: BusinessRule) => r.rule_key === 'default_treatment_minutes');
      const otherCalRule = data.find((r: BusinessRule) => r.rule_key === 'other_calendar_password');

      if (inactiveRule) setInactiveDays(inactiveRule.rule_value);
      if (excludeRule) setExcludeKeywords(excludeRule.rule_value);
      if (churnRule) setChurnLapsedDays(churnRule.rule_value);
      if (maxSlotsRule) setDailyMaxSlots(maxSlotsRule.rule_value);
      if (adSpendRule) setMonthlyAdSpend(adSpendRule.rule_value);
      if (adKeywordsRule) setAdSourceKeywords(adKeywordsRule.rule_value);
      if (menuDurationRule) setMenuDurationRules(menuDurationRule.rule_value);
      if (defaultMinutesRule) setDefaultTreatmentMinutes(defaultMinutesRule.rule_value);
      if (otherCalRule) setOtherCalendarPassword(otherCalRule.rule_value);
    }

    try {
      const a = await fetchAlertFollowConfig();
      setAlertFollow(a);
    } catch {
      setAlertFollow(DEFAULT_ALERT_FOLLOW);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'inactive_days_threshold',
        rule_value: inactiveDays,
        description: '離脱判定日数（最終来院からの経過日数）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'exclude_keywords',
        rule_value: excludeKeywords,
        description: '通院回数カウント除外キーワード（メニュー名、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_lapsed_days',
        rule_value: churnLapsedDays,
        description: '離患判定の経過日数（最終活動からの日数・分析用デフォルト90日）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'daily_max_slots',
        rule_value: dailyMaxSlots,
        description: '稼働率計算に使う1日の最大予約枠数',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'monthly_ad_spend',
        rule_value: monthlyAdSpend,
        description: '広告分析で使う月間広告費',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'ad_source_keywords',
        rule_value: adSourceKeywords,
        description: '広告経由判定キーワード（顧客流入に含む語、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'menu_duration_rules',
        rule_value: menuDurationRules,
        description: '分単価用メニュー時間設定（1行1件: キーワード:分）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'default_treatment_minutes',
        rule_value: defaultTreatmentMinutes,
        description: '分単価計算の既定施術時間（分）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'other_calendar_password',
        rule_value: otherCalendarPassword.trim(),
        description: '予約カレンダー「予約以外」タブの入室パスワード',
      },
      { onConflict: 'rule_key' }
    );

    setSaving(false);
    alert('設定を保存しました');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="text-center py-12 text-gray-500">読み込み中...</div>
      </div>
    );
  }

  const keywordArray = excludeKeywords.split(',').filter(k => k.trim());

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="text-teal-600" size={32} />
        <h2 className="text-2xl font-bold text-gray-800">経営ルール設定</h2>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg overflow-hidden border-2 border-amber-200">
          <button
            type="button"
            onClick={() => togglePanel('alertFollow')}
            className="w-full p-4 flex items-center justify-between text-left bg-amber-50"
          >
            <h3 className="font-bold text-amber-900 text-lg">アラート・フォロー日数帯</h3>
            <span className="text-amber-700 font-bold">{openPanels.alertFollow ? '▲' : '▼'}</span>
          </button>
          {openPanels.alertFollow && (
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3">
                設定 &gt; ここ（経営ルール）で、アラート画面のフォロー日数帯と
                <span className="font-bold">アクティブ（何日未満）</span>
                を変更できます。下の枠専用の「この日数帯を保存」でDBに即保存されます。
              </p>
              <div className="p-0 rounded-lg overflow-hidden border-2 border-amber-200">
                <AlertFollowRangeEditor
                  value={alertFollow}
                  onSaved={(c) => setAlertFollow(c)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('inactive')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-blue-900 text-lg">離脱判定基準</h3>
            <span className="text-blue-700 font-bold">{openPanels.inactive ? '▲' : '▼'}</span>
          </button>
          {openPanels.inactive && (
            <div className="px-5 pb-5">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                最終来院から何日経過したら「離脱予備軍」とみなすか
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={inactiveDays}
                  onChange={(e) => setInactiveDays(e.target.value)}
                  className="w-32 px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none text-lg font-bold text-center"
                  min="1"
                />
                <span className="text-lg font-bold text-gray-700">日</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                現在の設定: {inactiveDays}日以上来院していない顧客が「離脱予備軍」として表示されます
              </p>
            </div>
          )}
        </div>

        <div className="bg-teal-50 border-l-4 border-teal-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('churn')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-teal-900 text-lg">離患判定日数（分析）</h3>
            <span className="text-teal-700 font-bold">{openPanels.churn ? '▲' : '▼'}</span>
          </button>
          {openPanels.churn && (
            <div className="px-5 pb-5">
              <p className="text-sm text-gray-600 mb-2">
                半年/12ヶ月離患率などの分析で「最終来院・物販・サブスクのいずれも無い状態が続いた日数」の閾値に使用します（既定90日）。
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={churnLapsedDays}
                  onChange={(e) => setChurnLapsedDays(e.target.value)}
                  className="w-32 px-4 py-3 border-2 border-gray-300 rounded-lg text-lg font-bold text-center"
                  min={1}
                />
                <span className="text-lg font-bold text-gray-700">日</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-green-50 border-l-4 border-green-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('slots')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-green-900 text-lg">稼働率（最大枠数）</h3>
            <span className="text-green-700 font-bold">{openPanels.slots ? '▲' : '▼'}</span>
          </button>
          {openPanels.slots && (
            <div className="px-5 pb-5">
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={dailyMaxSlots}
                  onChange={(e) => setDailyMaxSlots(e.target.value)}
                  className="w-32 px-4 py-3 border-2 border-gray-300 rounded-lg text-lg font-bold text-center"
                  min={1}
                />
                <span className="text-lg font-bold text-gray-700">枠 / 日</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-rose-50 border-l-4 border-rose-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('ads')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-rose-900 text-lg">広告分析（ROAS / CPA）</h3>
            <span className="text-rose-700 font-bold">{openPanels.ads ? '▲' : '▼'}</span>
          </button>
          {openPanels.ads && (
            <div className="px-5 pb-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">月間広告費（円）</label>
                <input
                  type="number"
                  value={monthlyAdSpend}
                  onChange={(e) => setMonthlyAdSpend(e.target.value)}
                  className="w-48 px-4 py-3 border-2 border-gray-300 rounded-lg text-lg font-bold"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">広告判定キーワード（流入の文字列照合、カンマ区切り）</label>
                <input
                  type="text"
                  value={adSourceKeywords}
                  onChange={(e) => setAdSourceKeywords(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg"
                  placeholder="広告,インスタ,instagram,meta,google,line"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-cyan-50 border-l-4 border-cyan-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('duration')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-cyan-900 text-lg">分単価（施術時間設定）</h3>
            <span className="text-cyan-700 font-bold">{openPanels.duration ? '▲' : '▼'}</span>
          </button>
          {openPanels.duration && (
            <div className="px-5 pb-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">既定施術時間（分）</label>
                <input
                  type="number"
                  value={defaultTreatmentMinutes}
                  onChange={(e) => setDefaultTreatmentMinutes(e.target.value)}
                  className="w-32 px-4 py-3 border-2 border-gray-300 rounded-lg text-lg font-bold text-center"
                  min={1}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">メニュー別時間（1行1件: キーワード:分）</label>
                <textarea
                  value={menuDurationRules}
                  onChange={(e) => setMenuDurationRules(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-mono text-sm"
                  placeholder={'初回:60\n鍼:40\n骨盤矯正:30'}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-purple-50 border-l-4 border-purple-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('exclude')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-purple-900 text-lg">通院回数カウント除外設定</h3>
            <span className="text-purple-700 font-bold">{openPanels.exclude ? '▲' : '▼'}</span>
          </button>
          {openPanels.exclude && (
            <div className="px-5 pb-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  通院回数にカウントしないキーワード（メニュー名に含まれる場合）
                </label>
                <textarea
                  value={excludeKeywords}
                  onChange={(e) => setExcludeKeywords(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 outline-none"
                  rows={3}
                  placeholder="BE,初回,体験"
                />
                <p className="text-sm text-gray-600 mt-2">
                  カンマ（,）で区切って入力してください。これらのキーワードを含むメニューは通院0回としてカウントされます。
                </p>
              </div>

              <div className="mt-4">
                <div className="text-sm font-bold text-gray-700 mb-2">現在の除外キーワード:</div>
                <div className="flex flex-wrap gap-2">
                  {keywordArray.map((keyword, index) => (
                    <div
                      key={index}
                      className="bg-purple-200 text-purple-900 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2"
                    >
                      <span>{keyword.trim()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-violet-50 border-2 border-violet-200 rounded-lg p-5">
          <h3 className="font-bold text-violet-900 text-lg mb-2">予約カレンダー「予約以外」タブのパスワード</h3>
          <p className="text-sm text-gray-700 mb-3">
            院長個人予定用のカレンダー表示に入室するときのパスワードです。未設定のままでは「予約以外」タブを開けません。
          </p>
          <input
            type="password"
            value={otherCalendarPassword}
            onChange={(e) => setOtherCalendarPassword(e.target.value)}
            className="w-full max-w-md px-4 py-2 border-2 border-violet-300 rounded-lg"
            placeholder="例: 任意の合言葉"
            autoComplete="new-password"
          />
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg">
          <button
            type="button"
            onClick={() => setShowImpactGuide((v) => !v)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <h3 className="font-bold text-yellow-900 text-lg">設定の影響</h3>
            <span className="text-yellow-700 font-bold">{showImpactGuide ? '▲' : '▼'}</span>
          </button>
          {showImpactGuide && (
            <ul className="space-y-2 text-sm text-gray-700 px-5 pb-5">
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 font-bold">・</span>
                <span>
                  <strong>アラート・フォロー日数帯:</strong> 上部の「アラート」タブの4枚（黄・橙・赤）と緑（アクティブ）の日数帯
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 font-bold">・</span>
                <span>
                  <strong>離脱予備軍アラート:</strong> 設定した日数を超えた顧客が自動的にアラートに表示されます
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 font-bold">・</span>
                <span>
                  <strong>通院回数:</strong> 除外キーワードを含むメニューは「0回目」としてカウントされ、リピート率計算に影響します
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 font-bold">・</span>
                <span>
                  <strong>分析データ:</strong> すべての分析・レポート画面でこの設定が適用されます
                </span>
              </li>
            </ul>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 px-6 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-xl font-bold text-lg shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save size={24} />
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>
    </div>
  );
}
