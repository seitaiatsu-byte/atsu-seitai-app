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
  const [alertFollow, setAlertFollow] = useState<AlertFollowConfig>(DEFAULT_ALERT_FOLLOW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

      if (inactiveRule) setInactiveDays(inactiveRule.rule_value);
      if (excludeRule) setExcludeKeywords(excludeRule.rule_value);
      if (churnRule) setChurnLapsedDays(churnRule.rule_value);
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
        <div>
          <p className="text-sm text-gray-600 mb-3">
            設定 &gt; ここ（経営ルール）で、アラート画面のフォロー日数帯と<span className="font-bold">アクティブ（何日未満）</span>
            を変更できます。下の枠専用の「この日数帯を保存」でDBに即保存されます。
          </p>
          <div className="p-0 rounded-lg overflow-hidden border-2 border-amber-200">
            <AlertFollowRangeEditor
              value={alertFollow}
              onSaved={(c) => setAlertFollow(c)}
            />
          </div>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-lg">
          <h3 className="font-bold text-blue-900 text-lg mb-4">離脱判定基準</h3>
          <div>
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
        </div>

        <div className="bg-teal-50 border-l-4 border-teal-500 p-5 rounded-lg">
          <h3 className="font-bold text-teal-900 text-lg mb-4">離患判定日数（分析）</h3>
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

        <div className="bg-purple-50 border-l-4 border-purple-500 p-5 rounded-lg">
          <h3 className="font-bold text-purple-900 text-lg mb-4">通院回数カウント除外設定</h3>
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

        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-5 rounded-lg">
          <h3 className="font-bold text-yellow-900 text-lg mb-3">設定の影響</h3>
          <ul className="space-y-2 text-sm text-gray-700">
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
