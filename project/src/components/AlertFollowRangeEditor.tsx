import { useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import {
  type AlertFollowConfig,
  labelActiveShort,
  labelOrangeRange,
  labelRedRange,
  labelYellowRange,
  upsertAlertFollowConfig,
  validateAlertFollowConfig,
} from '../lib/alertFollowConfig';

type Props = {
  value: AlertFollowConfig;
  onSaved?: (c: AlertFollowConfig) => void;
};

export default function AlertFollowRangeEditor({ value, onSaved }: Props) {
  const [active, setActive] = useState(String(value.activeMaxExclusive));
  const [t1, setT1] = useState(String(value.tier1End));
  const [t2, setT2] = useState(String(value.tier2End));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setActive(String(value.activeMaxExclusive));
    setT1(String(value.tier1End));
    setT2(String(value.tier2End));
  }, [value.activeMaxExclusive, value.tier1End, value.tier2End]);

  const parsed = (): AlertFollowConfig | null => {
    const a = parseInt(active, 10);
    const b = parseInt(t1, 10);
    const c = parseInt(t2, 10);
    if (![a, b, c].every((n) => Number.isFinite(n) && n > 0)) return null;
    return { activeMaxExclusive: a, tier1End: b, tier2End: c };
  };

  const doSave = async () => {
    setErr(null);
    const c = parsed();
    if (!c) {
      setErr('1以上の整数で指定してください。');
      return;
    }
    const vErr = validateAlertFollowConfig(c);
    if (vErr) {
      setErr(vErr);
      return;
    }
    setSaving(true);
    try {
      await upsertAlertFollowConfig(c);
      onSaved?.(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const preview = parsed();
  const pErr = preview ? validateAlertFollowConfig(preview) : null;

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 font-bold text-amber-900">
          <SlidersHorizontal className="text-amber-700" size={20} />
          フォロー日数帯
        </div>
      </div>
      <p className="text-sm text-amber-900/90 mb-3">
        <span className="font-bold">アラート</span>画面の4枚（黄・橙・赤の経過日数帯／緑の
        <span className="font-bold"> アクティブ</span>＝最終までの経過が「左の日数
        未満」）の基準をまとめて指定します。アクティブ30日相当も、左欄（アクティブ帯）の数値で変えられます。保存は下の
        <span className="font-bold"> この日数帯を保存</span> を押してください（下部の大きな「設定を保存」とは別操作です）。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <label className="block text-sm">
          <span className="font-bold text-gray-800">アクティブ帯（緑の「○日未満」）</span>
          <span className="block text-xs text-gray-600">最終来院の経過日数がこの日数未満ならアクティブ</span>
          <input
            type="number"
            min={1}
            value={active}
            onChange={(e) => setActive(e.target.value)}
            className="mt-1 w-full border-2 border-amber-300 rounded-lg px-3 py-2 font-bold text-center"
          />
        </label>
        <label className="block text-sm">
          <span className="font-bold text-gray-800">2番目の帯 まで</span>
          <span className="block text-xs text-gray-600">黄色の上端日数</span>
          <input
            type="number"
            min={2}
            value={t1}
            onChange={(e) => setT1(e.target.value)}
            className="mt-1 w-full border-2 border-amber-300 rounded-lg px-3 py-2 font-bold text-center"
          />
        </label>
        <label className="block text-sm">
          <span className="font-bold text-gray-800">3番目の帯 まで</span>
          <span className="block text-xs text-gray-600">橙の上端日数</span>
          <input
            type="number"
            min={3}
            value={t2}
            onChange={(e) => setT2(e.target.value)}
            className="mt-1 w-full border-2 border-amber-300 rounded-lg px-3 py-2 font-bold text-center"
          />
        </label>
      </div>
      {preview && pErr && <p className="text-sm text-red-700 mb-2">{pErr}</p>}
      {preview && !pErr && (
        <p className="text-sm text-amber-900/90 mb-2">
          プレビュー: 黄＝{labelYellowRange(preview)} ／ 橙＝{labelOrangeRange(preview)} ／
          赤＝{labelRedRange(preview)} ／ 緑＝{labelActiveShort(preview)}に来院
        </p>
      )}
      {!preview && <p className="text-sm text-amber-900/80 mb-2">プレビュー: 有効な数値を入力してください</p>}
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      <button
        type="button"
        onClick={() => void doSave()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-amber-600 text-white font-bold px-4 py-2 text-sm shadow hover:bg-amber-700 disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? '保存中…' : 'この日数帯を保存'}
      </button>
    </div>
  );
}
