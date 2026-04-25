export type ClinicScope = 'all' | 'takatsuki' | 'kawanishi';

interface ClinicScopeToggleProps {
  value: ClinicScope;
  onChange: (v: ClinicScope) => void;
}

export default function ClinicScopeToggle({ value, onChange }: ClinicScopeToggleProps) {
  const btn = (v: ClinicScope, label: string, className: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
        value === v ? className : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-gray-600 mr-1">院別:</span>
      {btn('all', '合算', 'bg-slate-700 text-white shadow')}
      {btn('takatsuki', '高槻院', 'bg-blue-600 text-white shadow')}
      {btn('kawanishi', '川西', 'bg-orange-500 text-white shadow')}
    </div>
  );
}
