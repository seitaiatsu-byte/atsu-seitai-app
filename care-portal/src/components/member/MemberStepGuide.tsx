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
    <div className={`member-step-panel ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      {!compact && <p className="text-base sm:text-lg font-bold member-text-emerald mb-3">ご利用の手順</p>}
      <ol className="space-y-3">
        {items.map((step) => {
          const active = currentStep === step.number;
          return (
            <li
              key={step.number}
              className={`member-step-item ${active ? 'member-step-item-active' : ''}`}
            >
              <span
                className={`member-step-num ${active ? 'member-step-num-active' : ''}`}
                aria-hidden
              >
                {step.number}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`font-bold text-member-text ${compact ? 'text-base' : 'text-lg'}`}>
                  {active && !compact ? `いまはステップ${step.number}：` : ''}
                  {step.title}
                </p>
                <p className={`mt-1 member-text-muted leading-relaxed ${compact ? 'text-sm' : 'text-base'}`}>
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
