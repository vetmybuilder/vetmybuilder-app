// web/components/builder/ScoreChip.tsx

type ScoreChipProps = {
  value?: number;
};

export default function ScoreChip({ value }: ScoreChipProps) {
  if (value == null || Number.isNaN(Number(value))) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600">
        VMB —
      </span>
    );
  }

  const numericValue = Number(value);
  const label =
    numericValue <= 5
      ? numericValue.toFixed(1).replace(/\.0$/, "")
      : String(Math.round(numericValue));

  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
      title={`VMB score: ${label}`}
      aria-label={`VMB score ${label}`}
      data-testid="builder-vmb-score"
    >
      VMB {label}
    </span>
  );
}
