import type { MemberGuideStep } from '../../lib/memberGuide';

type Props = {
  currentStep?: number;
  steps?: MemberGuideStep[];
  compact?: boolean;
};

export default function MemberStepGuide({ currentStep, steps, compact }: Props) {
  const items = steps ?? [];
  if (items.length === 0) return null;

  return (
    <div
      className={`rounded-2xl border-2 border-teal-200 bg-teal-50/80 ${
        compact ? 'p-3' : 'p-4 sm:p-5'
      }`}
    >
      {!compact && (
        <p className="text-base sm:text-lg font-bold text-teal-900 mb-3">ご利用の手順</p>
      )}
      <ol className="space-y-3">
        {items.map((step) => {
          const active = currentStep === step.number;
          return (
            <li
              key={step.number}
              className={`flex gap-3 rounded-xl p-3 ${
                active ? 'bg-white border-2 border-teal-500 shadow-sm' : 'bg-white/70 border border-teal-100'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                  active ? 'bg-teal-600 text-white' : 'bg-teal-200 text-teal-900'
                }`}
                aria-hidden
              >
                {step.number}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`font-bold text-slate-900 ${compact ? 'text-base' : 'text-lg'}`}>
                  {active && !compact ? `いまはステップ${step.number}：` : ''}
                  {step.title}
                </p>
                <p className={`mt-1 text-slate-700 leading-relaxed ${compact ? 'text-sm' : 'text-base'}`}>
                  {step.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
