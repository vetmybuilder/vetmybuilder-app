// web/components/AccordionRow.tsx
import * as React from "react";
import { ChevronDown } from "lucide-react";

type AccordionRowProps = {
  expanded: boolean;
  onToggle: () => void;
  header: React.ReactNode;
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
    <div className="border-b border-slate-200" data-testid={testId}>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left bg-white hover:bg-slate-50"
      >
        <div>{header}</div>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t-2 border-red-500 bg-white px-4 py-5 shadow-inner">
          {children}
        </div>
      )}
    </div>
  );
}
