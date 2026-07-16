import type { ManualFlowStep } from '../../lib/memberGuide';

type Props = {
  title: string;
  steps: ManualFlowStep[];
};

export default function ManualFlowTimeline({ title, steps }: Props) {
  return (
    <section className="member-card p-5 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold text-member-gold-deep mb-4">{title}</h2>
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={index} className="member-step-item member-step-item-active !border-member-gold-soft/40">
            <span className="member-step-num member-step-num-active shrink-0">{index + 1}</span>
            <div className="min-w-0 space-y-2 text-sm sm:text-base">
              <dl className="grid grid-cols-1 sm:grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1">
                <dt className="font-bold text-member-gold-deep">だれが</dt>
                <dd className="member-text-muted">{step.who}</dd>
                <dt className="font-bold text-member-gold-deep">いつ</dt>
                <dd className="member-text-muted">{step.when}</dd>
                <dt className="font-bold text-member-gold-deep">どこで</dt>
                <dd className="member-text-muted break-all">{step.where}</dd>
              </dl>
              <p className="pt-1 border-t border-member-gold-soft/30">
                <span className="font-bold text-member-text">やること：</span>
                <span className="member-text-muted"> {step.what}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
