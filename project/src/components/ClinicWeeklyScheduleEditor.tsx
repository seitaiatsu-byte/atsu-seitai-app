import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type ClinicDaySlots,
} from '../lib/clinicWeeklySchedule';

type Props = {
  title: string;
  slots: ClinicDaySlots;
  onChange: (next: ClinicDaySlots) => void;
  accentClass?: string;
};

export default function ClinicWeeklyScheduleEditor({ title, slots, onChange, accentClass = 'text-green-900' }: Props) {
  const weekKeys = WEEKDAY_KEYS.filter((k) => k !== 'sun');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <h4 className={`text-sm font-bold mb-2 ${accentClass}`}>{title}</h4>
      <p className="text-[11px] text-gray-500 mb-2">
        曜日ごとの枠上限（0＝休診）。メニューごとの消費枠は下の「メニュー別枠」で設定。日曜は休診固定。
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {weekKeys.map((key) => (
          <label key={key} className="text-center">
            <span className="block text-xs font-bold text-gray-600 mb-1">{WEEKDAY_LABELS[key]}</span>
            <input
              type="number"
              min={0}
              max={99}
              value={slots[key]}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                onChange({ ...slots, [key]: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
              className="w-full px-2 py-2 border-2 border-gray-200 rounded-lg text-center font-bold text-sm"
            />
          </label>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-gray-400 text-right">日: 休診（0枠）</div>
    </div>
  );
}
