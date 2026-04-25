import React from "react";

export interface IncomingLead {
  matchId: string;
  projectId: string;
  title: string;
  budget: string;
  outward: string;
  startWindow: string;
  homeownerFirstName: string;
  description: string;
  trades: string[];
  source: "recommended" | "subscribed";
  recommenderName?: string;
  pickedHoursAgo: number;
}

export default function IncomingLeadCard({ lead }: { lead: IncomingLead }) {
  const source =
    lead.source === "recommended"
      ? `Recommended by ${lead.recommenderName ?? "network"}`
      : null;
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-md p-5">
      <h3 className="text-lg font-extrabold leading-tight">{lead.title}</h3>
      <div className="flex flex-wrap gap-2 mt-3">
        {lead.budget && <Pill>{lead.budget}</Pill>}
        {lead.outward && <Pill>{lead.outward}</Pill>}
        {lead.startWindow && <Pill>{lead.startWindow}</Pill>}
      </div>
      <div className="mt-3 text-sm text-gray-600">
        {lead.homeownerFirstName} · picked you {lead.pickedHoursAgo}h ago
      </div>
      <p className="mt-3 text-sm text-gray-700 line-clamp-5">
        {lead.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {lead.trades.map((t) => (
          <Pill key={t}>{t}</Pill>
        ))}
      </div>
      {source && (
        <div className="mt-3 inline-flex text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
          {source}
        </div>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex text-xs font-semibold text-gray-800 bg-gray-100 rounded-full px-3 py-1">
      {children}
    </span>
  );
}
