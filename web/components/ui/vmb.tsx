import * as React from "react";
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon } from "./Icons";
import type { VerificationStatus } from "@/types/vmb";

export function ScoreChip({ value }: { value?: number }) {
  if (value == null || Number.isNaN(Number(value))) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600">
        VMB —
      </span>
    );
  }
  const n = Number(value);
  const label =
    n <= 5 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
      title={`VMB score: ${label}`}
      aria-label={`VMB score ${label}`}
      data-testid="shortlist-vmb-score"
    >
      VMB {label}
    </span>
  );
}

/* Companies House badge helpers */
export function chLabel(status?: VerificationStatus) {
  switch (status) {
    case "verified":
      return "Verified";
    case "running":
    case "queued":
      return "Checking";
    case "ambiguous":
      return "Needs review";
    case "no_match":
      return "No match";
    case "error":
      return "Error";
    default:
      return "Checking";
  }
}

export function chBadgeClass(status?: VerificationStatus) {
  switch (status) {
    case "verified":
      return "bg-green-300 text-orange-700 border-green-200 font-bold";
    case "ambiguous":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "no_match":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "error":
      return "bg-red-100 text-red-700 border-red-200";
    case "queued":
    case "running":
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function chIcon(status?: VerificationStatus) {
  switch (status) {
    case "verified":
      return <CheckCircleIcon className="h-3.5 w-3.5" />;
    case "queued":
    case "running":
      return <ClockIcon className="h-3.5 w-3.5" />;
    case "ambiguous":
    case "no_match":
    case "error":
      return <ExclamationTriangleIcon className="h-3.5 w-3.5" />;
    default:
      return <ClockIcon className="h-3.5 w-3.5" />;
  }
}
