import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import {
  adminGetStudyRoomTitle,
  adminListGreetingVideos,
  adminListProgramDefs,
  adminListProgramRules,
  adminListSubRoomMaster,
  adminListWatchLayout,
  adminSaveProgramDefs,
  adminSaveProgramRules,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot } from '../../lib/greetingVideos';
import {
  PROGRAM_TIER_CODES,
  countAccessSummary,
  programTierLabel,
  toggleAllowedTier,
  type ProgramDef,
  type ProgramItemRule,
  type ProgramTier,
} from '../../lib/programTiers';
import { DEFAULT_STUDY2_ROOM_TITLE, DEFAULT_STUDY_ROOM_TITLE } from '../../lib/studyRoom';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT } from '../../lib/subRooms';
import {
  watchLayoutKindLabel,
  watchLayoutLabel,
  type WatchLayoutItemKey,
} from '../../lib/watchLayout';

export default function AdminProgramRulesSection() {
  const [layoutKeys, setLayoutKeys] = useState<WatchLayoutItemKey[]>([]);
  const [rules, setRules] = useState<Record<string, ProgramTier[]>>({});
  const [defs, setDefs] = useState<ProgramDef[]>([]);
  const [studyTitle, setStudyTitle] = useState(DEFAULT_STUDY_ROOM_TITLE);
  const [study2Title, setStudy2Title] = useState(DEFAULT_STUDY2_ROOM_TITLE);
  const [greetingTitles, setGreetingTitles] = useState<Partial<Record<GreetingSlot, string>>>({});
  const [subRoomTitles, setSubRoomTitles] = useState<Record<number, string>>({});
  const [previewTier, setPreviewTier] = useState<ProgramTier>('A');
  const [loading, setLoading] = useState(true);
  const [savingNames, setSavingNames] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [layout, programRules, programDefs, study, study2, greetings, master] = await Promise.all([
        adminListWatchLayout(),
        adminListProgramRules(),
        adminListProgramDefs(),
        adminGetStudyRoomTitle('study'),
        adminGetStudyRoomTitle('study2'),
        adminListGreetingVideos(),
        adminListSubRoomMaster(),
      ]);
      setLayoutKeys(layout);
      setDefs(programDefs);
      setStudyTitle(study);
      setStudy2Title(study2);

      const next: Record<string, ProgramTier[]> = {};
      for (const key of layout) next[key] = [...PROGRAM_TIER_CODES];
      for (const rule of programRules) next[rule.item_key] = rule.allowed_tiers;
      setRules(next);

      const gTitles: Partial<Record<GreetingSlot, string>> = { ...DEFAULT_GREETING_TITLES };
      for (const g of greetings) gTitles[g.slot_code] = g.title;
      setGreetingTitles(gTitles);

      const sTitles: Record<number, string> = { ...DEFAULT_SUB_ROOM_TITLES };
      for (let i = 1; i <= SUB_ROOM_COUNT; i++) {
        if (!sTitles[i]) sTitles[i] = `小部屋${i}`;
      }
      for (const m of master) sTitles[m.slot_number] = m.title;
      setSubRoomTitles(sTitles);
    } catch (err) {
      alert(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const ruleList: ProgramItemRule[] = useMemo(
    () =>
      layoutKeys.map((item_key) => ({
        item_key,
        allowed_tiers: rules[item_key] ?? [...PROGRAM_TIER_CODES],
      })),
    [layoutKeys, rules]
  );

  const preview = useMemo(
    () => countAccessSummary(ruleList, previewTier, layoutKeys),
    [ruleList, previewTier, layoutKeys]
  );

  const handleSaveNames = async () => {
    setSavingNames(true);
    try {
      await adminSaveProgramDefs(
        defs.map((d) => ({
          code: d.code,
          display_name: d.display_name.trim() || d.code,
          password_interval_months:
            typeof d.password_interval_months === 'number' ? d.password_interval_months : 3,
        }))
      );
      alert('プログラム名とパス更新期間を保存しました');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSavingNames(false);
    }
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      await adminSaveProgramRules(ruleList);
      alert('鍵の対象範囲を保存しました。会員画面に反映されます。');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSavingRules(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">読み込み中…</p>;
  }

  return (
    <section className="space-y-4">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <KeyRound size={18} className="text-indigo-600" />
        購入プログラム（A〜E）と鍵の範囲
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        プログラム区分は A〜E の5つです。表示名は自由に変更できます。各枠は、開ける区分にチェックを付けたものだけ会員がタップできます。
      </p>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-700">プログラム名とパス更新期間</p>
          <button
            type="button"
            disabled={savingNames}
            onClick={() => void handleSaveNames()}
            className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save size={14} />
            {savingNames ? '保存中…' : '保存'}
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          期間（月）ごとに入室パスが自動で4桁数字に変わります。会員は新しいパスをスタッフに聞いて入り直します。0にすると自動更新しません。
        </p>
        <ul className="space-y-2">
          {defs.map((d) => (
            <li key={d.code} className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-sm shrink-0">
                {d.code}
              </span>
              <input
                value={d.display_name}
                onChange={(e) =>
                  setDefs((prev) =>
                    prev.map((x) => (x.code === d.code ? { ...x, display_name: e.target.value } : x))
                  )
                }
                className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg border text-sm"
                placeholder={`プログラム${d.code}`}
              />
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600 shrink-0">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={d.password_interval_months ?? 3}
                  onChange={(e) =>
                    setDefs((prev) =>
                      prev.map((x) =>
                        x.code === d.code
                          ? { ...x, password_interval_months: Math.max(0, Number(e.target.value) || 0) }
                          : x
                      )
                    )
                  }
                  className="w-16 px-2 py-2 rounded-lg border text-sm"
                />
                ヶ月
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <p className="text-sm font-bold text-slate-700">確認プレビュー</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          会員にどのプログラムを付けるか決める前のシミュレーションです。下の A〜E
          を押すと、「そのプログラムの人が開ける枠／鍵付きの枠」がすぐ分かります。保存ボタンではありません。
        </p>
        <div className="flex flex-wrap gap-2">
          {PROGRAM_TIER_CODES.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setPreviewTier(tier)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                previewTier === tier
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {programTierLabel(tier, defs)}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-600">
          「{programTierLabel(previewTier, defs)}」の場合：開ける {preview.unlocked} / 鍵{' '}
          {preview.locked}（全{preview.total}枠）
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={savingRules}
          onClick={() => void handleSaveRules()}
          className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Save size={14} />
          {savingRules ? '保存中…' : '鍵ルールを保存'}
        </button>
      </div>

      <ul className="space-y-2">
        {layoutKeys.map((key) => {
          const allowed = rules[key] ?? [...PROGRAM_TIER_CODES];
          const unlockedInPreview = allowed.includes(previewTier);
          return (
            <li
              key={key}
              className={`rounded-xl border p-3 space-y-2 ${
                unlockedInPreview ? 'bg-white' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <div>
                <p className="text-xs font-bold text-indigo-700">
                  {watchLayoutKindLabel(key, { greetingTitles })}
                </p>
                <p className="text-sm font-bold text-slate-800 mt-0.5 leading-snug line-clamp-2">
                  {watchLayoutLabel(key, { studyTitle, study2Title, greetingTitles, subRoomTitles })}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  開ける区分にチェック（外すと鍵）
                  {!unlockedInPreview && ' ／ プレビューでは鍵'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROGRAM_TIER_CODES.map((code) => {
                  const on = allowed.includes(code);
                  return (
                    <label
                      key={code}
                      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                        on ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setRules((prev) => ({
                            ...prev,
                            [key]: toggleAllowedTier(prev[key] ?? [...PROGRAM_TIER_CODES], code),
                          }))
                        }
                      />
                      {programTierLabel(code, defs)}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
