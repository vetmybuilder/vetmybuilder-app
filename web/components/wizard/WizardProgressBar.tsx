type Tone = "indigo" | "emerald";

type Props = {
  step: number;
  total: number;
  tone?: Tone;
};

const TONES: Record<Tone, string> = {
  indigo: "bg-indigo-600",
  emerald: "bg-emerald-600",
};

export default function WizardProgressBar({ step, total, tone = "indigo" }: Props) {
  const pct = Math.max(0, Math.min(100, (step / total) * 100));
  return (
    <div className="bg-white px-[14px] pt-3 pb-2 flex-shrink-0">
      <div className="h-[5px] w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${TONES[tone]} rounded-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] font-bold text-gray-500">
        Step {step} of {total}
      </p>
    </div>
  );
}
