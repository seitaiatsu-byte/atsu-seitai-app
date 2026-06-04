import { useEffect, useMemo, useState } from 'react';
import { useUnsavedFormGuard } from '../lib/unsavedFormGuard';
import { Plus, Save, Trash2 } from 'lucide-react';
import FlexibleTimeInput from './FlexibleTimeInput';
import {
  DEFAULT_WEEKDAY_BUSINESS_HOURS,
  fetchWeekdayBusinessHours,
  saveWeekdayBusinessHours,
  timeToMinutes,
  type BreakPeriod,
  type WeekdayBusinessHour,
} from '../lib/weekdayBusinessHours';

const EMPTY_BREAK: BreakPeriod = { start_time: '12:00', end_time: '13:00' };

export default function WeekdayBusinessHoursPanel() {
  const [rows, setRows] = useState<WeekdayBusinessHour[]>(DEFAULT_WEEKDAY_BUSINESS_HOURS);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await fetchWeekdayBusinessHours();
    setRows(data);
    setSavedSnapshot(JSON.stringify(data));
    setLoading(false);
  };

  const isHoursDirty = useMemo(
    () => !loading && savedSnapshot.length > 0 && JSON.stringify(rows) !== savedSnapshot,
    [loading, rows, savedSnapshot]
  );
  useUnsavedFormGuard('weekday-business-hours', isHoursDirty);

  useEffect(() => {
    void load();
  }, []);

  const patchRow = (weekday: number, patch: Partial<WeekdayBusinessHour>) => {
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  const patchBreak = (weekday: number, index: number, patch: Partial<BreakPeriod>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.weekday !== weekday) return r;
        const breaks = [...(r.breaks || [])];
        breaks[index] = { ...breaks[index], ...patch };
        return { ...r, breaks };
      })
    );
  };

  const addBreak = (weekday: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.weekday !== weekday) return r;
        return { ...r, breaks: [...(r.breaks || []), { ...EMPTY_BREAK }] };
      })
    );
  };

  const removeBreak = (weekday: number, index: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.weekday !== weekday) return r;
        return { ...r, breaks: (r.breaks || []).filter((_, i) => i !== index) };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await saveWeekdayBusinessHours(rows);
    setSaving(false);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert('曜日営業時間・休憩を保存しました');
    window.dispatchEvent(new Event('masters-updated'));
    setSavedSnapshot(JSON.stringify(rows));
    void load();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        予約カレンダーの <strong>Vac.</strong>（空白）と <strong className="text-zinc-900">不可時間</strong>
        （休憩・予約不可）に使います。休憩は営業時間の内側で登録し、カレンダーでは黒っぽく表示されます。
        <strong> 休業</strong>の曜日は表示しません。
      </p>

      {loading ? (
        <div className="text-center py-10 font-bold text-gray-400">読み込み中...</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.weekday}
              className={`p-3 rounded-xl border space-y-2 ${
                row.is_open ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span
                  className={`w-12 font-bold ${
                    row.weekday === 0 ? 'text-red-600' : row.weekday === 6 ? 'text-blue-600' : 'text-gray-800'
                  }`}
                >
                  {row.label}
                </span>
                <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={row.is_open}
                    onChange={(e) =>
                      patchRow(row.weekday, {
                        is_open: e.target.checked,
                        breaks: e.target.checked ? row.breaks : [],
                      })
                    }
                  />
                  営業
                </label>
                <div
                  className={`flex items-center gap-2 flex-1 min-w-[200px] ${row.is_open ? '' : 'opacity-50 pointer-events-none'}`}
                >
                  <span className="text-xs text-gray-500 shrink-0">開始</span>
                  <FlexibleTimeInput
                    value={row.start_time}
                    onChange={(v) => patchRow(row.weekday, { start_time: v })}
                    ariaLabel={`${row.label} 開始`}
                    className="w-24 border rounded-lg px-2 py-1.5 text-sm font-mono"
                  />
                  <span className="text-xs text-gray-500 shrink-0">終了</span>
                  <FlexibleTimeInput
                    value={row.end_time}
                    onChange={(v) => patchRow(row.weekday, { end_time: v })}
                    ariaLabel={`${row.label} 終了`}
                    className="w-24 border rounded-lg px-2 py-1.5 text-sm font-mono"
                  />
                </div>
                {row.is_open && timeToMinutes(row.end_time) <= timeToMinutes(row.start_time) && (
                  <span className="text-xs font-bold text-red-600">終了は開始より後に</span>
                )}
              </div>

              {row.is_open && (
                <div className="pl-2 sm:pl-14 border-t border-slate-200 pt-2 space-y-2">
                  <div className="text-xs font-bold text-zinc-700">休憩（予約不可・不可時間として表示）</div>
                  {(row.breaks || []).length === 0 ? (
                    <p className="text-xs text-gray-500">休憩なし</p>
                  ) : (
                    (row.breaks || []).map((brk, idx) => (
                      <div
                        key={`${row.weekday}-brk-${idx}`}
                        className="flex flex-wrap items-center gap-2 bg-zinc-50 border border-zinc-300 rounded-lg p-2"
                      >
                        <span className="text-xs text-zinc-600 shrink-0">休憩{idx + 1}</span>
                        <FlexibleTimeInput
                          value={brk.start_time}
                          onChange={(v) => patchBreak(row.weekday, idx, { start_time: v })}
                          ariaLabel={`${row.label} 休憩${idx + 1} 開始`}
                          className="w-24 border border-zinc-400 rounded-lg px-2 py-1 text-sm font-mono"
                        />
                        <span className="text-xs text-gray-500">〜</span>
                        <FlexibleTimeInput
                          value={brk.end_time}
                          onChange={(v) => patchBreak(row.weekday, idx, { end_time: v })}
                          ariaLabel={`${row.label} 休憩${idx + 1} 終了`}
                          className="w-24 border border-zinc-400 rounded-lg px-2 py-1 text-sm font-mono"
                        />
                        {timeToMinutes(brk.end_time) <= timeToMinutes(brk.start_time) && (
                          <span className="text-xs font-bold text-red-600">終了＞開始</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeBreak(row.weekday, idx)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="この休憩を削除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => addBreak(row.weekday)}
                    className="inline-flex items-center gap-1 text-sm font-bold text-zinc-800 hover:text-zinc-950"
                  >
                    <Plus size={16} />
                    休憩を追加
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={saving || loading}
        onClick={() => void handleSave()}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 text-white font-bold disabled:opacity-50"
      >
        <Save size={20} />
        {saving ? '保存中…' : '曜日営業時間・休憩を保存'}
      </button>
    </div>
  );
}
