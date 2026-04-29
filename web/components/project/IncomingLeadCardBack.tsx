// web/components/project/IncomingLeadCardBack.tsx
//
// Back face of an incoming-lead card on /tradesman/leads. Shown when the
// tradesman taps (i) - the card flips on the Y axis to reveal the full
// project description plus a CTA to open the canonical project page.

import React from "react";
import { ChevronRight } from "lucide-react";
import type { IncomingLead } from "./IncomingLeadCard";

export default function IncomingLeadCardBack({
  lead,
  onViewFull,
}: {
  lead: IncomingLead;
  onViewFull?: () => void;
}) {
  const source =
    lead.source === "recommended"
      ? `Recommended by ${lead.recommenderName ?? "network"}`
      : null;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-md flex flex-col h-full overflow-hidden">
      <div
        className="px-5 py-4 text-white"
        style={{ background: "linear-gradient(135deg, #6366f1, #4338ca)" }}
      >
        <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-90">
          Project details
        </div>
        <div className="mt-0.5 text-[18px] font-extrabold leading-tight">
          {lead.title}
        </div>
        {source && (
          <div className="mt-1 text-[12px] opacity-90">{source}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1.5">
            Description
          </div>
          <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">
            {lead.description}
          </p>
        </div>

        {lead.trades.length > 0 && (
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1.5">
              Trades
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lead.trades.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11.5px] font-bold text-gray-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1.5">
            At a glance
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.budget && <Pill>{lead.budget}</Pill>}
            {lead.outward && <Pill>{lead.outward}</Pill>}
            {lead.startWindow && <Pill>{lead.startWindow}</Pill>}
            <Pill>
              {lead.homeownerFirstName} · {lead.pickedHoursAgo}h ago
            </Pill>
          </div>
        </div>
      </div>

      {onViewFull && (
        <button
          type="button"
          onClick={onViewFull}
          className="border-t border-gray-100 px-4 py-3.5 flex items-center justify-between text-[13px] font-extrabold text-indigo-700"
        >
          <span>View full project</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11.5px] font-bold text-gray-700">
      {children}
    </span>
  );
}
