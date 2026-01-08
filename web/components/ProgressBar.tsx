import * as React from "react";

type ProgressBarProps = {
  current: number;       // zero-based index
  total: number;         // number of steps
  labels?: string[];     // optional text labels
};

export default function ProgressBar({ current, total, labels }: ProgressBarProps) {
  const pct = Math.min(100, ((current + 1) / total) * 100);

  return (
    <div className="w-full mb-4">
      {/* Progress bar */}
      <div className="relative h-2 w-full bg-slate-200 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-[#F6A72B] transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Optional labels below */}
      {labels && labels.length === total && (
        <div className="mt-3 flex w-full justify-between">
          {labels.map((label, i) => (
            <div
              key={i}
              className={`flex-1 text-center text-[11px] ${
                i === current
                  ? "font-semibold text-[#C97F17]"
                  : "text-slate-500"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
