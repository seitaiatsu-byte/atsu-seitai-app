import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import FlexibleTimeInput from './FlexibleTimeInput';
import {
  DEFAULT_WEEKDAY_BUSINESS_HOURS,
  fetchWeekdayBusinessHours,
  saveWeekdayBusinessHours,
  timeToMinutes,
  type WeekdayBusinessHour,
} from '../lib/weekdayBusinessHours';

export default function WeekdayBusinessHoursPanel() {
  const [rows, setRows] = useState<WeekdayBusinessHour[]>(DEFAULT_WEEKDAY_BUSINESS_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setRows(await fetchWeekdayBusinessHours());
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const patchRow = (weekday: number, patch: Partial<WeekdayBusinessHour>) => {
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await saveWeekdayBusinessHours(rows);
    setSaving(false);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    alert('曜日営業時間を保存しました');
    window.dispatchEvent(new Event('masters-updated'));
    void load();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        予約カレンダーの <strong>Vac.</strong> に使います。営業開始〜最初の予約、最後の予約〜営業終了の空白も表示します。
        <strong> 休業</strong>の曜日は Vac. を出しません。
      </p>

      {loading ? (
        <div className="text-center py-10 font-bold text-gray-400">読み込み中...</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.weekday}
              className={`flex flex-wrap items-center gap-2 sm:gap-3 p-3 rounded-xl border ${
                row.is_open ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <span className={`w-12 font-bold ${row.weekday === 0 ? 'text-red-600' : row.weekday === 6 ? 'text-blue-600' : 'text-gray-800'}`}>
                {row.label}
              </span>
              <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={row.is_open}
                  onChange={(e) => patchRow(row.weekday, { is_open: e.target.checked })}
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
        {saving ? '保存中…' : '曜日営業時間を保存'}
      </button>
    </div>
  );
}
