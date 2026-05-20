// web/components/project/IncomingLeadCard.tsx
//
// Front face of an incoming-lead card on /tradesman/leads. The lead has
// no photo, so the hero is a project-type pill on a soft emerald
// gradient instead of an image. Card uses h-full flex flex-col so it
// fills whatever container the page gives it - the leads page wraps it
// in a flex-1 div so the card visibly fills the viewport rather than
// floating in a sea of background.
import React from "react";
import { Sparkles } from "lucide-react";

export interface IncomingLead {
  matchId: string;
  projectId: string;
  title: string;
  budget: string;
  outward: string;
  startWindow: string;
  description: string;
  trades: string[];
  source: "recommended" | "subscribed" | "paid_unlock";
  recommenderName?: string;
  pickedHoursAgo: number;
}

function formatPickedAgo(hours: number): string {
  if (hours <= 0) return "just now";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function IncomingLeadCard({ lead }: { lead: IncomingLead }) {
  const isRecommended = lead.source === "recommended";
  const recBadge = isRecommended
    ? `Recommended by ${lead.recommenderName ?? "your network"}`
    : null;
  const primaryTrade = lead.trades[0] ?? "Job";

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-md flex flex-col h-full overflow-hidden">
      {/* Hero - emerald gradient with primary-trade label and a "picked you" timestamp.
          Stands in for the missing photo and gives the card visual weight. */}
      <div
        className="relative px-5 pt-5 pb-6 text-white overflow-hidden"
        style={{ background: "linear-gradient(135deg, #10b981, #047857)" }}
      >
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.4) 0%, transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-extrabold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            New lead
          </span>
          {lead.outward && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] font-extrabold">
              {lead.outward}
            </span>
          )}
        </div>
        <h3 className="relative mt-4 text-[22px] font-black leading-[1.15] tracking-tight">
          {lead.title}
        </h3>
        <div className="relative mt-2 text-[12.5px] font-semibold opacity-90">
          A homeowner picked you {formatPickedAgo(lead.pickedHoursAgo)}
        </div>
      </div>

      {/* Body - description + meta + trades. Scrolls if content overflows
          so the hero stays pinned at top. */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {recBadge && (
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            ★ {recBadge}
          </div>
        )}

        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-400 mb-1.5">
            What they need
          </div>
          <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap">
            {lead.description || "No additional notes from the homeowner."}
          </p>
        </div>

        {(lead.budget || lead.startWindow) && (
          <div className="flex flex-wrap gap-2">
            {lead.budget && (
              <Pill tone="emerald">
                <span className="opacity-70 mr-1">Budget</span>
                <strong>{lead.budget}</strong>
              </Pill>
            )}
            {lead.startWindow && (
              <Pill tone="slate">
                <span className="opacity-70 mr-1">Start</span>
                <strong>{lead.startWindow}</strong>
              </Pill>
            )}
          </div>
        )}

        {lead.trades.length > 0 && (
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-400 mb-1.5">
              Trades wanted
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                {primaryTrade}
              </span>
              {lead.trades.slice(1).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold bg-gray-50 text-gray-700 border border-gray-200"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "emerald" | "slate";
}) {
  const palette =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <span
      className={`inline-flex items-center text-[12px] font-semibold rounded-full px-3 py-1 border ${palette}`}
    >
      {children}
    </span>
  );
}
