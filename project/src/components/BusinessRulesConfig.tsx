import { useState, useEffect } from 'react';
import { Settings, Save, KeyRound } from 'lucide-react';
import SecretInputField, {
  OTHER_CAL_PASSWORD_HINT,
  OTHER_CAL_RECOVERY_HINT,
} from './SecretInputField';
import { supabase } from '../lib/supabase';
import { type AlertFollowConfig, DEFAULT_ALERT_FOLLOW, fetchAlertFollowConfig } from '../lib/alertFollowConfig';
import {
  changeOtherCalendarPassword,
  fetchOtherCalendarRecoveryPhrase,
  isOtherCalendarPasswordConfigured,
  revealOtherCalendarPasswordByRecovery,
  saveOtherCalendarPasswordInitial,
} from '../lib/otherCalendarAuth';
import AlertFollowRangeEditor from './AlertFollowRangeEditor';
import {
  DEFAULT_CHURN_CONFIG,
  DEFAULT_FINAL_VISIT_KEYWORDS,
  DEFAULT_MAIN_PRODUCT_KEYWORDS,
  DEFAULT_PROGRAM_KEYWORDS,
  DEFAULT_REVISIT_KEYWORDS,
} from '../lib/churnConfig';
import {
  DEFAULT_KAWANISHI_SCHEDULE,
  DEFAULT_TAKATSUKI_SCHEDULE,
  parseClinicDaySlots,
  serializeClinicDaySlots,
  weeklySlotSum,
  type ClinicDaySlots,
} from '../lib/clinicWeeklySchedule';
import ClinicWeeklyScheduleEditor from './ClinicWeeklyScheduleEditor';

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
  const [churnMainProductKeywords, setChurnMainProductKeywords] = useState(
    DEFAULT_MAIN_PRODUCT_KEYWORDS.join(',')
  );
  const [churnProgramKeywords, setChurnProgramKeywords] = useState(DEFAULT_PROGRAM_KEYWORDS.join(','));
  const [churnFinalVisitKeywords, setChurnFinalVisitKeywords] = useState(
    DEFAULT_FINAL_VISIT_KEYWORDS.join(',')
  );
  const [churnRevisitKeywords, setChurnRevisitKeywords] = useState(DEFAULT_REVISIT_KEYWORDS.join(','));
  const [churnWindowsFlat, setChurnWindowsFlat] = useState(DEFAULT_CHURN_CONFIG.windowsFlat.join(','));
  const [churnWindowsSingle, setChurnWindowsSingle] = useState(
    DEFAULT_CHURN_CONFIG.windowsSingle.join(',')
  );
  const [churnWindowsPostProgram, setChurnWindowsPostProgram] = useState(
    DEFAULT_CHURN_CONFIG.windowsPostProgram.join(',')
  );
  const [churnWindowsPostTicket, setChurnWindowsPostTicket] = useState(
    DEFAULT_CHURN_CONFIG.windowsPostTicket.join(',')
  );
  const [churnWindowsRevisit, setChurnWindowsRevisit] = useState(
    DEFAULT_CHURN_CONFIG.windowsRevisit.join(',')
  );
  const [dailyMaxSlots, setDailyMaxSlots] = useState('20');
  const [takatsukiWeekly, setTakatsukiWeekly] = useState<ClinicDaySlots>({ ...DEFAULT_TAKATSUKI_SCHEDULE });
  const [kawanishiWeekly, setKawanishiWeekly] = useState<ClinicDaySlots>({ ...DEFAULT_KAWANISHI_SCHEDULE });
  const [utilExcludeHolidays, setUtilExcludeHolidays] = useState(true);
  const [utilMenuSlotRules, setUtilMenuSlotRules] = useState('');
  const [utilDefaultMenuSlot, setUtilDefaultMenuSlot] = useState('1');
  const [monthlyAdSpend, setMonthlyAdSpend] = useState('0');
  const [adSourceKeywords, setAdSourceKeywords] = useState('広告,インスタ,instagram,meta,google,line');
  const [menuDurationRules, setMenuDurationRules] = useState('');
  const [defaultTreatmentMinutes, setDefaultTreatmentMinutes] = useState('60');
  const [otherCalConfigured, setOtherCalConfigured] = useState(false);
  const [otherCalRecoveryConfigured, setOtherCalRecoveryConfigured] = useState(false);
  const [otherCalInitialPw, setOtherCalInitialPw] = useState('');
  const [otherCalInitialPhrase, setOtherCalInitialPhrase] = useState('');
  const [otherCalCurrentPw, setOtherCalCurrentPw] = useState('');
  const [otherCalNewPw, setOtherCalNewPw] = useState('');
  const [otherCalNewPhrase, setOtherCalNewPhrase] = useState('');
  const [otherCalRecoveryInput, setOtherCalRecoveryInput] = useState('');
  const [otherCalRevealedPw, setOtherCalRevealedPw] = useState('');
  const [otherCalSaving, setOtherCalSaving] = useState(false);
  const [otherCalRevealBusy, setOtherCalRevealBusy] = useState(false);
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
    otherCalendar: false,
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
      if (inactiveRule) setInactiveDays(inactiveRule.rule_value);
      if (excludeRule) setExcludeKeywords(excludeRule.rule_value);
      if (churnRule) setChurnLapsedDays(churnRule.rule_value);
      const churnMainKwRule = data.find((r: BusinessRule) => r.rule_key === 'churn_main_product_keywords');
      const churnKwRule = data.find((r: BusinessRule) => r.rule_key === 'churn_program_keywords');
      const churnFinalKwRule = data.find((r: BusinessRule) => r.rule_key === 'churn_final_visit_keywords');
      const churnRevisitKwRule = data.find((r: BusinessRule) => r.rule_key === 'churn_revisit_keywords');
      const churnWinFlatRule = data.find((r: BusinessRule) => r.rule_key === 'churn_windows_flat');
      const churnWinSingleRule = data.find((r: BusinessRule) => r.rule_key === 'churn_windows_single');
      const churnWinPostProgramRule = data.find(
        (r: BusinessRule) => r.rule_key === 'churn_windows_post_program'
      );
      const churnWinProgramRule = data.find((r: BusinessRule) => r.rule_key === 'churn_windows_program');
      const churnWinPostTicketRule = data.find(
        (r: BusinessRule) => r.rule_key === 'churn_windows_post_ticket'
      );
      const churnWinTicketRule = data.find((r: BusinessRule) => r.rule_key === 'churn_windows_ticket');
      const churnWinRevisitRule = data.find((r: BusinessRule) => r.rule_key === 'churn_windows_revisit');
      if (churnMainKwRule) setChurnMainProductKeywords(churnMainKwRule.rule_value);
      if (churnKwRule) setChurnProgramKeywords(churnKwRule.rule_value);
      if (churnFinalKwRule) setChurnFinalVisitKeywords(churnFinalKwRule.rule_value);
      if (churnRevisitKwRule) setChurnRevisitKeywords(churnRevisitKwRule.rule_value);
      if (churnWinFlatRule) setChurnWindowsFlat(churnWinFlatRule.rule_value);
      if (churnWinSingleRule) setChurnWindowsSingle(churnWinSingleRule.rule_value);
      if (churnWinPostProgramRule) setChurnWindowsPostProgram(churnWinPostProgramRule.rule_value);
      else if (churnWinProgramRule) setChurnWindowsPostProgram(churnWinProgramRule.rule_value);
      if (churnWinPostTicketRule) setChurnWindowsPostTicket(churnWinPostTicketRule.rule_value);
      else if (churnWinTicketRule) setChurnWindowsPostTicket(churnWinTicketRule.rule_value);
      if (churnWinRevisitRule) setChurnWindowsRevisit(churnWinRevisitRule.rule_value);
      if (maxSlotsRule) setDailyMaxSlots(maxSlotsRule.rule_value);
      const takWeekRule = data.find((r: BusinessRule) => r.rule_key === 'util_weekly_schedule_takatsuki');
      const kawaWeekRule = data.find((r: BusinessRule) => r.rule_key === 'util_weekly_schedule_kawanishi');
      const utilHolidayRule = data.find((r: BusinessRule) => r.rule_key === 'util_exclude_holidays');
      if (takWeekRule) {
        setTakatsukiWeekly(parseClinicDaySlots(takWeekRule.rule_value, DEFAULT_TAKATSUKI_SCHEDULE));
      }
      if (kawaWeekRule) {
        setKawanishiWeekly(parseClinicDaySlots(kawaWeekRule.rule_value, DEFAULT_KAWANISHI_SCHEDULE));
      }
      if (utilHolidayRule) setUtilExcludeHolidays(utilHolidayRule.rule_value !== '0');
      const utilMenuSlotRule = data.find((r: BusinessRule) => r.rule_key === 'util_menu_slot_rules');
      const utilDefaultMenuSlotRule = data.find((r: BusinessRule) => r.rule_key === 'util_default_menu_slot');
      if (utilMenuSlotRule) setUtilMenuSlotRules(utilMenuSlotRule.rule_value);
      if (utilDefaultMenuSlotRule) setUtilDefaultMenuSlot(utilDefaultMenuSlotRule.rule_value);
      if (adSpendRule) setMonthlyAdSpend(adSpendRule.rule_value);
      if (adKeywordsRule) setAdSourceKeywords(adKeywordsRule.rule_value);
      if (menuDurationRule) setMenuDurationRules(menuDurationRule.rule_value);
      if (defaultMinutesRule) setDefaultTreatmentMinutes(defaultMinutesRule.rule_value);
    }

    try {
      const a = await fetchAlertFollowConfig();
      setAlertFollow(a);
    } catch {
      setAlertFollow(DEFAULT_ALERT_FOLLOW);
    }

    try {
      await refreshOtherCalStatus();
    } catch {
      setOtherCalConfigured(false);
      setOtherCalRecoveryConfigured(false);
    }

    setLoading(false);
  };

  const refreshOtherCalStatus = async () => {
    setOtherCalConfigured(await isOtherCalendarPasswordConfigured());
    try {
      const phrase = await fetchOtherCalendarRecoveryPhrase();
      setOtherCalRecoveryConfigured(phrase.length > 0);
    } catch {
      setOtherCalRecoveryConfigured(false);
    }
  };

  const handleSaveOtherCalInitial = async () => {
    setOtherCalSaving(true);
    const result = await saveOtherCalendarPasswordInitial(otherCalInitialPw, otherCalInitialPhrase);
    setOtherCalSaving(false);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setOtherCalInitialPw('');
    setOtherCalInitialPhrase('');
    await refreshOtherCalStatus();
    alert('入室パスワードと合言葉を保存しました。\n予約カレンダーの「予約以外」タブを開くときは、この入室パスワードを入力します。');
  };

  const handleChangeOtherCalPassword = async () => {
    setOtherCalSaving(true);
    const result = await changeOtherCalendarPassword({
      currentPassword: otherCalCurrentPw,
      newPassword: otherCalNewPw,
      newRecoveryPhrase: otherCalNewPhrase,
    });
    setOtherCalSaving(false);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setOtherCalCurrentPw('');
    setOtherCalNewPw('');
    setOtherCalNewPhrase('');
    await refreshOtherCalStatus();
    alert('入室パスワードを変更しました。');
  };

  const handleRevealOtherCalPassword = async () => {
    setOtherCalRevealBusy(true);
    setOtherCalRevealedPw('');
    const result = await revealOtherCalendarPasswordByRecovery(otherCalRecoveryInput);
    setOtherCalRevealBusy(false);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setOtherCalRevealedPw(result.password);
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
        rule_key: 'churn_main_product_keywords',
        rule_value: churnMainProductKeywords,
        description: '離脱分析：本商品（BE）購入判定キーワード（カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_program_keywords',
        rule_value: churnProgramKeywords,
        description: '離脱分析：プログラム契約判定キーワード（メニュー名・支払詳細、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_final_visit_keywords',
        rule_value: churnFinalVisitKeywords,
        description: '離脱分析：最終回メニュー判定キーワード（カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_revisit_keywords',
        rule_value: churnRevisitKeywords,
        description: '離脱分析：再診メニュー判定キーワード（カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_windows_flat',
        rule_value: churnWindowsFlat,
        description: '離脱分析：A全体フラットの観察窓（日数、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_windows_single',
        rule_value: churnWindowsSingle,
        description: '離脱分析：B-1都度の観察窓（日数、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_windows_post_program',
        rule_value: churnWindowsPostProgram,
        description: '離脱分析：B-3プログラム終了後の観察窓（日数、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_windows_post_ticket',
        rule_value: churnWindowsPostTicket,
        description: '離脱分析：B-2回数券消化後の観察窓（日数、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'churn_windows_revisit',
        rule_value: churnWindowsRevisit,
        description: '離脱分析：C再診率の観察窓（日数、カンマ区切り）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'daily_max_slots',
        rule_value: dailyMaxSlots,
        description: '稼働率：週間枠未設定時のフォールバック（全日一律枠数）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'util_weekly_schedule_takatsuki',
        rule_value: serializeClinicDaySlots(takatsukiWeekly),
        description: '稼働率：高槻院の曜日別最大枠（JSON。0=休診）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'util_weekly_schedule_kawanishi',
        rule_value: serializeClinicDaySlots(kawanishiWeekly),
        description: '稼働率：川西院の曜日別最大枠（JSON。0=休診）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'util_exclude_holidays',
        rule_value: utilExcludeHolidays ? '1' : '0',
        description: '稼働率：国民の祝日を休診として分母から除外（1=する）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'util_menu_slot_rules',
        rule_value: utilMenuSlotRules,
        description: '稼働率：メニュー別消費枠（1行1件 キーワード:枠数。例 60分:1 30分:0.5）',
      },
      { onConflict: 'rule_key' }
    );

    await supabase.from('business_rules').upsert(
      {
        rule_key: 'util_default_menu_slot',
        rule_value: utilDefaultMenuSlot,
        description: '稼働率：メニュー別ルール未マッチ時の消費枠（通常1）',
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
            <h3 className="font-bold text-teal-900 text-lg">離患率・離患判定（分析）</h3>
            <span className="text-teal-700 font-bold">{openPanels.churn ? '▲' : '▼'}</span>
          </button>
          {openPanels.churn && (
            <div className="px-5 pb-5 space-y-4">
              <p className="text-sm text-gray-600">
                アラートページ上部の<strong>本商品起点の離脱・継続・再診率</strong>の設定です。
                通院除外は上の <strong>exclude_keywords</strong> のみ（ここでは勝手に足しません）。
                詳細は <code className="text-xs bg-white px-1 rounded">docs/churn-rate-design.md</code>
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    本商品（BE）判定キーワード
                  </label>
                  <textarea
                    value={churnMainProductKeywords}
                    onChange={(e) => setChurnMainProductKeywords(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="BE,本商品,..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    プログラム判定キーワード
                  </label>
                  <textarea
                    value={churnProgramKeywords}
                    onChange={(e) => setChurnProgramKeywords(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="6M,6ヶ月,プログラム,..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    最終回メニューキーワード
                  </label>
                  <textarea
                    value={churnFinalVisitKeywords}
                    onChange={(e) => setChurnFinalVisitKeywords(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="プログラム最終,最終回,卒業"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">再診メニューキーワード</label>
                  <textarea
                    value={churnRevisitKeywords}
                    onChange={(e) => setChurnRevisitKeywords(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="再診,再開,..."
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1">A 全体フラット（日）</label>
                  <input
                    type="text"
                    value={churnWindowsFlat}
                    onChange={(e) => setChurnWindowsFlat(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-mono"
                    placeholder="90,180"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-orange-800 mb-1">B-1 都度（日）</label>
                  <input
                    type="text"
                    value={churnWindowsSingle}
                    onChange={(e) => setChurnWindowsSingle(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-orange-200 rounded-lg text-sm font-mono"
                    placeholder="90,180"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-violet-800 mb-1">B-2 券消化後（日）</label>
                  <input
                    type="text"
                    value={churnWindowsPostTicket}
                    onChange={(e) => setChurnWindowsPostTicket(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-violet-200 rounded-lg text-sm font-mono"
                    placeholder="90,180,365"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-blue-800 mb-1">B-3 プログラム後（日）</label>
                  <input
                    type="text"
                    value={churnWindowsPostProgram}
                    onChange={(e) => setChurnWindowsPostProgram(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-blue-200 rounded-lg text-sm font-mono"
                    placeholder="90,180,365"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-indigo-800 mb-1">C 再診率（日）</label>
                  <input
                    type="text"
                    value={churnWindowsRevisit}
                    onChange={(e) => setChurnWindowsRevisit(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-mono"
                    placeholder="90,180,365"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                A/B-1は本商品購入日から。B-2/B-3は最終回マーク（なければ想定期間）から。Cは最終回マークから。
                観察期間が終わった人だけが分母に入ります。
              </p>

              <div className="pt-2 border-t border-teal-200">
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  レガシー：最終活動からの離患経過日数
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  従来の「最終来院・物販・サブスクが無い状態」の閾値（既定90日）。新しいコホート離患率とは別指標です。
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
            </div>
          )}
        </div>

        <div className="bg-green-50 border-l-4 border-green-500 rounded-lg">
          <button
            type="button"
            onClick={() => togglePanel('slots')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <h3 className="font-bold text-green-900 text-lg">稼働率（週間枠・院別）</h3>
            <span className="text-green-700 font-bold">{openPanels.slots ? '▲' : '▼'}</span>
          </button>
          {openPanels.slots && (
            <div className="px-5 pb-5 space-y-4">
              <p className="text-sm text-gray-600">
                1人運営向けに、<strong>曜日ごとの最大予約枠</strong>を院別に設定します。0＝その曜日は休診。
                土曜午前のみ少なめ、など実態に合わせて枠数を入れてください。
              </p>

              <ClinicWeeklyScheduleEditor
                title={`高槻院（月〜土）— 週合計 ${weeklySlotSum(takatsukiWeekly)} 枠`}
                slots={takatsukiWeekly}
                onChange={setTakatsukiWeekly}
                accentClass="text-blue-800"
              />
              <ClinicWeeklyScheduleEditor
                title={`川西院（月〜土）— 週合計 ${weeklySlotSum(kawanishiWeekly)} 枠`}
                slots={kawanishiWeekly}
                onChange={setKawanishiWeekly}
                accentClass="text-orange-800"
              />
              <p className="text-[11px] text-gray-500">
                1ヶ月の供給枠の目安 ≒ 週合計 × 4週（GWなど祝日は自動で除く）。過去月も<strong>今の設定</strong>で再計算します。
              </p>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={utilExcludeHolidays}
                  onChange={(e) => setUtilExcludeHolidays(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span>
                  国民の祝日は休診扱い（振替休日・国民の休日を含む一般的なカレンダー）
                </span>
              </label>

              <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 space-y-3">
                <h4 className="text-sm font-bold text-green-900">メニュー別消費枠</h4>
                <p className="text-[11px] text-gray-600 leading-snug">
                  メニュー名に含まれる語でマッチ。1=標準1枠、0.5=半枠、2=2枠分。
                  曜日の上限枠はこの加重枠の合計で計算します。
                </p>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-gray-700 whitespace-nowrap">未マッチ時</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={utilDefaultMenuSlot}
                    onChange={(e) => setUtilDefaultMenuSlot(e.target.value)}
                    className="w-20 px-2 py-1 border-2 border-gray-200 rounded-lg text-center font-bold text-sm"
                  />
                  <span className="text-xs text-gray-600">枠</span>
                </div>
                <textarea
                  value={utilMenuSlotRules}
                  onChange={(e) => setUtilMenuSlotRules(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-sm bg-white"
                  placeholder={'60分:1\n30分:0.5\n初回:1\n6M:1.5\nプログラム:1.5'}
                />
              </div>

              <div className="pt-2 border-t border-green-200">
                <p className="text-xs text-gray-500 mb-2">
                  週間枠を保存する前の互換用。両院の週間枠が未設定のときだけ使います。
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={dailyMaxSlots}
                    onChange={(e) => setDailyMaxSlots(e.target.value)}
                    className="w-24 px-3 py-2 border-2 border-gray-200 rounded-lg font-bold text-center"
                    min={1}
                  />
                  <span className="text-sm font-bold text-gray-600">枠 / 営業日（フォールバック）</span>
                </div>
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

        <div className="bg-violet-50 border-l-4 border-violet-500 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => togglePanel('otherCalendar')}
            className="w-full p-5 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <KeyRound className="text-violet-700 shrink-0" size={22} />
              <h3 className="font-bold text-violet-900 text-lg">予約カレンダー「予約以外」タブのパスワード</h3>
            </div>
            <span className="text-violet-700 font-bold shrink-0 ml-2">{openPanels.otherCalendar ? '▲' : '▼'}</span>
          </button>
          {openPanels.otherCalendar && (
            <div className="px-5 pb-5 space-y-5">
              <p className="text-sm text-gray-700">
                <strong>ここ</strong>で入室パスワードと合言葉を登録します。
                <strong>カレンダー</strong>の「予約以外」では<strong>入室パスワードのみ</strong>（合言葉は不要）。
                各欄の<strong>目のアイコン</strong>で入力文字を表示できます。
              </p>
              <p className="text-sm">
                状態:{' '}
                <span className={`font-bold ${otherCalConfigured ? 'text-violet-800' : 'text-amber-800'}`}>
                  {otherCalConfigured ? '設定済み' : '未設定（タブを開けません）'}
                </span>
                {otherCalConfigured && (
                  <span className="text-gray-600">
                    {' '}
                    / 合言葉: {otherCalRecoveryConfigured ? '登録済み' : '未登録'}
                  </span>
                )}
              </p>

              {!otherCalConfigured ? (
                <div className="rounded-lg border border-violet-300 bg-white p-4 space-y-3">
                  <h4 className="font-bold text-violet-900">初回設定</h4>
                  <SecretInputField
                    label="入室パスワード（カレンダーで入力するもの）"
                    hint={OTHER_CAL_PASSWORD_HINT}
                    value={otherCalInitialPw}
                    onChange={setOtherCalInitialPw}
                    placeholder="4文字以上"
                    autoComplete="new-password"
                  />
                  <SecretInputField
                    label="合言葉（忘れたときにパスワードを確認する用）"
                    hint={OTHER_CAL_RECOVERY_HINT}
                    value={otherCalInitialPhrase}
                    onChange={setOtherCalInitialPhrase}
                    placeholder="例: たかつき2024"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    disabled={otherCalSaving}
                    onClick={() => void handleSaveOtherCalInitial()}
                    className="px-5 py-2 rounded-lg bg-violet-600 text-white font-bold disabled:opacity-50"
                  >
                    {otherCalSaving ? '保存中…' : 'パスワードを保存'}
                  </button>
                </div>
              ) : (
                <>
                  {!otherCalRecoveryConfigured && (
                    <p className="text-sm text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 font-bold">
                      合言葉が未登録です。「パスワードを変更」で現在の入室パスワードを入れ、合言葉欄に新しい合言葉を入力して保存してください。
                    </p>
                  )}
                  <div className="rounded-lg border border-violet-300 bg-white p-4 space-y-3">
                    <h4 className="font-bold text-violet-900">パスワードを変更</h4>
                    <SecretInputField
                      label="現在の入室パスワード"
                      hint={OTHER_CAL_PASSWORD_HINT}
                      value={otherCalCurrentPw}
                      onChange={setOtherCalCurrentPw}
                      autoComplete="current-password"
                    />
                    <SecretInputField
                      label="新しい入室パスワード"
                      hint={OTHER_CAL_PASSWORD_HINT}
                      value={otherCalNewPw}
                      onChange={setOtherCalNewPw}
                      placeholder="4文字以上"
                      autoComplete="new-password"
                    />
                    <SecretInputField
                      label="合言葉を変える場合のみ（空欄なら今のまま）"
                      hint={OTHER_CAL_RECOVERY_HINT}
                      value={otherCalNewPhrase}
                      onChange={setOtherCalNewPhrase}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      disabled={otherCalSaving}
                      onClick={() => void handleChangeOtherCalPassword()}
                      className="px-5 py-2 rounded-lg bg-violet-600 text-white font-bold disabled:opacity-50"
                    >
                      {otherCalSaving ? '変更中…' : 'パスワードを変更して保存'}
                    </button>
                  </div>

                  <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-4 space-y-3">
                    <h4 className="font-bold text-amber-950">入室パスワードを忘れたとき</h4>
                    <SecretInputField
                      label="合言葉"
                      hint={OTHER_CAL_RECOVERY_HINT}
                      value={otherCalRecoveryInput}
                      onChange={(v) => {
                        setOtherCalRecoveryInput(v);
                        setOtherCalRevealedPw('');
                      }}
                      inputClassName="border-2 border-amber-400 rounded-lg"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      disabled={otherCalRevealBusy}
                      onClick={() => void handleRevealOtherCalPassword()}
                      className="px-5 py-2 rounded-lg border-2 border-amber-600 text-amber-950 font-bold bg-white disabled:opacity-50"
                    >
                      {otherCalRevealBusy ? '確認中…' : '合言葉でパスワードを表示'}
                    </button>
                    {otherCalRevealedPw && (
                      <SecretInputField
                        label="登録されている入室パスワード"
                        value={otherCalRevealedPw}
                        onChange={() => {}}
                        readOnly
                        inputClassName="border-2 border-amber-500 rounded-lg bg-white"
                      />
                    )}
                    <p className="text-xs text-gray-600">表示後はメモして、必要なら上の「変更」で新しいパスワードにしてください。</p>
                  </div>
                </>
              )}
            </div>
          )}
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
