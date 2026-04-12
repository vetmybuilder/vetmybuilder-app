// web/components/AccordionRow.tsx
// Smooth accordion using CSS grid-template-rows: 0fr → 1fr transition.
import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type AccordionRowProps = {
  expanded: boolean;
  onToggle: () => void;
  header: React.ReactNode | ((expanded: boolean) => React.ReactNode);
  children: React.ReactNode;
  testId?: string;
};

export default function AccordionRow({
  expanded,
  onToggle,
  header,
  children,
  testId,
}: AccordionRowProps) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm mb-3"
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-[#2d3748] text-white hover:bg-[#374151] transition-colors duration-200"
      >
        <div>{typeof header === "function" ? header(expanded) : header}</div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-white/70" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-white/70" />
        )}
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4 sm:p-6 bg-slate-50/80 space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
