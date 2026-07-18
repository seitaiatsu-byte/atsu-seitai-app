import { useMemo } from 'react';
import { Lock, Unlock } from 'lucide-react';
import {
  PROGRAM_TIER_OPTIONS,
  buildAccessMap,
  countAccessSummary,
  programTierLabel,
  type ProgramItemRule,
  type ProgramTier,
} from '../../lib/programTiers';
import {
  watchLayoutKindLabel,
  watchLayoutLabel,
  type WatchLayoutItemKey,
} from '../../lib/watchLayout';
import type { GreetingSlot } from '../../lib/greetingVideos';

type Props = {
  programTier: ProgramTier;
  onChange: (tier: ProgramTier) => void;
  rules: ProgramItemRule[];
  layoutKeys: WatchLayoutItemKey[];
  studyTitle?: string;
  greetingTitles?: Partial<Record<GreetingSlot, string>>;
  subRoomTitles?: Record<number, string>;
  /** 作成時は確認チェックを必須にする */
  requireConfirm?: boolean;
  confirmed?: boolean;
  onConfirmedChange?: (value: boolean) => void;
};

export default function ProgramAccessPreview({
  programTier,
  onChange,
  rules,
  layoutKeys,
  studyTitle,
  greetingTitles,
  subRoomTitles,
  requireConfirm = false,
  confirmed = false,
  onConfirmedChange,
}: Props) {
  const accessMap = useMemo(() => buildAccessMap(rules, programTier), [rules, programTier]);
  const summary = useMemo(
    () => countAccessSummary(rules, programTier, layoutKeys),
    [rules, programTier, layoutKeys]
  );

  return (
    <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div>
        <label className="text-xs font-bold text-slate-600 block mb-1">購入プログラム</label>
        <div className="grid grid-cols-3 gap-2">
          {PROGRAM_TIER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`text-sm font-bold px-2 py-2 rounded-lg border ${
                programTier === opt.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">{programTierLabel(programTier)}を適用します</p>
      </div>

      <div className="bg-white rounded-lg border p-3">
        <p className="text-sm font-bold text-slate-800">
          開ける枠 {summary.unlocked} ／ 鍵 {summary.locked}
        </p>
        <p className="text-xs text-slate-500 mt-1">マスターの鍵ルールに基づくプレビューです</p>
        <ul className="mt-2 max-h-48 overflow-y-auto space-y-1">
          {layoutKeys.map((key) => {
            const unlocked = accessMap[key]?.unlocked ?? true;
            return (
              <li
                key={key}
                className={`flex items-start gap-2 text-xs rounded-md px-2 py-1.5 ${
                  unlocked ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {unlocked ? (
                  <Unlock size={12} className="shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <Lock size={12} className="shrink-0 mt-0.5 text-slate-400" />
                )}
                <span className="min-w-0">
                  <span className="font-bold">{watchLayoutKindLabel(key)}</span>
                  {' · '}
                  {watchLayoutLabel(key, { studyTitle, greetingTitles, subRoomTitles })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {requireConfirm && (
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirmedChange?.(e.target.checked)}
            className="mt-1"
          />
          <span>
            上記の開ける枠／鍵の内容を確認しました（{programTierLabel(programTier)}）
          </span>
        </label>
      )}
    </div>
  );
}
