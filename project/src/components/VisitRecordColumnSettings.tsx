import { useVisitColumnPrefs } from '../lib/visitRecordColumnPrefs';

export default function VisitRecordColumnSettings() {
  const { prefs, setOne, defs } = useVisitColumnPrefs();

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100">
      <h2 className="text-xl font-bold text-gray-800 mb-2">来院記録の表示項目</h2>
      <p className="text-sm text-gray-600 mb-4">
        顧客プロフィール・個人カルテ等の表で、列として出す項目を選べます。データは Supabase にすべて格納され、ここは表示の出し分けです。
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {defs.map((d) => (
          <label
            key={d.id}
            className="flex items-start gap-2 rounded-lg border-2 border-gray-100 p-2 hover:bg-slate-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={prefs[d.id] !== false}
              onChange={(e) => setOne(d.id, e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-bold text-gray-800">{d.label}</span>
              {d.hint && <span className="block text-xs text-gray-500">{d.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
