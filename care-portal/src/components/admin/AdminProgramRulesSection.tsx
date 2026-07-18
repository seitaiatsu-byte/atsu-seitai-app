import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import {
  adminGetStudyRoomTitle,
  adminListGreetingVideos,
  adminListProgramRules,
  adminListSubRoomMaster,
  adminListWatchLayout,
  adminSaveProgramRules,
} from '../../lib/careApi';
import { DEFAULT_GREETING_TITLES, type GreetingSlot } from '../../lib/greetingVideos';
import {
  PROGRAM_MIN_TIER_OPTIONS,
  countAccessSummary,
  programMinTierLabel,
  programTierLabel,
  type ProgramItemRule,
  type ProgramMinTier,
  type ProgramTier,
} from '../../lib/programTiers';
import { DEFAULT_STUDY_ROOM_TITLE } from '../../lib/studyRoom';
import { DEFAULT_SUB_ROOM_TITLES, SUB_ROOM_COUNT } from '../../lib/subRooms';
import {
  watchLayoutKindLabel,
  watchLayoutLabel,
  type WatchLayoutItemKey,
} from '../../lib/watchLayout';

export default function AdminProgramRulesSection() {
  const [layoutKeys, setLayoutKeys] = useState<WatchLayoutItemKey[]>([]);
  const [rules, setRules] = useState<Record<string, ProgramMinTier>>({});
  const [studyTitle, setStudyTitle] = useState(DEFAULT_STUDY_ROOM_TITLE);
  const [greetingTitles, setGreetingTitles] = useState<Partial<Record<GreetingSlot, string>>>({});
  const [subRoomTitles, setSubRoomTitles] = useState<Record<number, string>>({});
  const [previewTier, setPreviewTier] = useState<ProgramTier>('p10');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [layout, programRules, study, greetings, master] = await Promise.all([
        adminListWatchLayout(),
        adminListProgramRules(),
        adminGetStudyRoomTitle(),
        adminListGreetingVideos(),
        adminListSubRoomMaster(),
      ]);
      setLayoutKeys(layout);
      setStudyTitle(study);

      const next: Record<string, ProgramMinTier> = {};
      for (const key of layout) next[key] = 10;
      for (const rule of programRules) next[rule.item_key] = rule.min_tier;
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
    () => layoutKeys.map((item_key) => ({ item_key, min_tier: rules[item_key] ?? 10 })),
    [layoutKeys, rules]
  );

  const preview = useMemo(
    () => countAccessSummary(ruleList, previewTier, layoutKeys),
    [ruleList, previewTier, layoutKeys]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminSaveProgramRules(ruleList);
      alert('鍵の対象範囲を保存しました。会員画面に反映されます。');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-center text-slate-500 py-6">読み込み中…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <KeyRound size={18} className="text-indigo-600" />
        鍵の対象範囲（購入プログラム）
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        各枠を開けるために必要なプログラムを設定します。会員ルーム側で 10万 / 20万 / 30万
        を選ぶと、ここより下の枠はグレー＋鍵でタップできなくなります。
      </p>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <p className="text-sm font-bold text-slate-700">確認プレビュー</p>
        <div className="flex flex-wrap gap-2">
          {(['p10', 'p20', 'p30'] as ProgramTier[]).map((tier) => (
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
              {programTierLabel(tier)}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-600">
          {programTierLabel(previewTier)}の場合：開ける {preview.unlocked} / 鍵 {preview.locked}（全
          {preview.total}枠）
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-1 text-sm font-bold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? '保存中…' : '鍵ルールを保存'}
        </button>
      </div>

      <ul className="space-y-2">
        {layoutKeys.map((key) => {
          const minTier = rules[key] ?? 10;
          const unlockedInPreview = previewTier === 'p30' || (previewTier === 'p20' ? minTier <= 20 : minTier <= 10);
          return (
            <li
              key={key}
              className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                unlockedInPreview ? 'bg-white' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-indigo-700">{watchLayoutKindLabel(key)}</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5 leading-snug line-clamp-2">
                  {watchLayoutLabel(key, { studyTitle, greetingTitles, subRoomTitles })}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  現在: {programMinTierLabel(minTier)}
                  {!unlockedInPreview && ' ／ プレビューでは鍵'}
                </p>
              </div>
              <select
                value={minTier}
                onChange={(e) =>
                  setRules((prev) => ({
                    ...prev,
                    [key]: Number(e.target.value) as ProgramMinTier,
                  }))
                }
                className="shrink-0 px-3 py-2 rounded-lg border text-sm bg-white"
              >
                {PROGRAM_MIN_TIER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
