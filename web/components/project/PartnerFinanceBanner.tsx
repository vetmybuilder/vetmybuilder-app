// web/components/project/PartnerFinanceBanner.tsx
import * as React from "react";
import { Home } from "lucide-react";

type Props = {
  estimateLow?: number | null;
  estimateHigh?: number | null;
};

export default function PartnerFinanceBanner({
  estimateLow,
  estimateHigh,
}: Props) {
  const hasEstimate =
    typeof estimateLow === "number" &&
    typeof estimateHigh === "number" &&
    estimateLow > 0 &&
    estimateHigh > 0;

  const estimateText = hasEstimate
    ? `Your project is estimated at £${estimateLow!.toLocaleString()}–£${estimateHigh!.toLocaleString()} — how would you like to fund it?`
    : "Home improvements can be a big investment — how would you like to fund it?";

  return (
    <section
      aria-label="Finance your project"
      data-testid="partner-finance-banner"
      className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-5 py-4 shadow-sm"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <Home size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Fund your project
          </p>
          <p className="text-xs text-slate-500">{estimateText}</p>
        </div>
      </div>
      <div className="flex flex-none gap-2 sm:ml-4">
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors whitespace-nowrap"
        >
          Personal loan
        </button>
        <button
          type="button"
          className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50 transition-colors whitespace-nowrap"
        >
          Remortgage
        </button>
      </div>
    </section>
  );
}
