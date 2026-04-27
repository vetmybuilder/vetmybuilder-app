type Tone = "indigo" | "emerald";

type Props = {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  tone?: Tone;
};

const PRIMARY: Record<Tone, string> = {
  indigo: "bg-indigo-600",
  emerald: "bg-emerald-600",
};

export default function WizardNavBar({
  onBack,
  onNext,
  nextLabel = "Next →",
  nextDisabled,
  busy,
  tone = "indigo",
}: Props) {
  return (
    <div className="bg-white border-t border-gray-100 flex items-center gap-2 px-3 py-3 flex-shrink-0">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="px-[18px] py-[11px] rounded-xl bg-white text-gray-900 border-[1.5px] border-gray-200 text-[13px] font-extrabold disabled:opacity-50"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || busy}
        className={`flex-1 ${PRIMARY[tone]} text-white px-3 py-[11px] rounded-xl text-[13px] font-extrabold disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {busy ? "…" : nextLabel}
      </button>
    </div>
  );
}
