import * as React from "react";

type Props = {
  className?: string;
  /** currently selected chip value */
  active?: string;
  /** called when user picks a chip */
  onPick?: (value: string) => void;
  /** optional: provide your own chip list; if omitted we show the default set */
  options?: string[];
  /** optional: show a small label before chips */
  label?: string;
  items: string[];
};

const DEFAULT_OPTIONS = ["Recommendations", "Kitchen", "Bathroom", "Bedroom", "Exterior"];

export default function FilterChips({
  className = "",
  active = "",
  onPick,
  options = DEFAULT_OPTIONS,
  label = "Filter by",
}: Props) {
  return (
    <div className={["flex items-center gap-3 flex-wrap", className].join(" ")}>
      <span className="text-slate-500 text-sm">{label}</span>
      <div className="flex items-center gap-3 flex-wrap">
        {options.map((opt) => {
          const selected = active === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onPick?.(selected ? "" : opt)}
              className={[
                "px-4 py-2 rounded-full border",
                "text-sm transition",
                selected
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-white text-slate-800 border-slate-200 hover:border-slate-300",
              ].join(" ")}
              data-testid={`chip-${opt}`}
              aria-pressed={selected}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
