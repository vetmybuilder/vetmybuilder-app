import { useState } from "react";

export interface MatchRow {
  matchId: string;
  builderFirstName: string;
  companyName: string;
  trades: string[];
  source: "recommended" | "ai-matched";
  status: "new" | "contacted" | "archived";
  whyMatch: string;
}

type Tab = "new" | "contacted" | "archived";

export default function MatchesList({
  projectTitle,
  matches,
  onOpen,
}: {
  projectTitle: string;
  matches: MatchRow[];
  onOpen: (m: MatchRow) => void;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const counts = {
    new: matches.filter(m => m.status === "new").length,
    contacted: matches.filter(m => m.status === "contacted").length,
    archived: matches.filter(m => m.status === "archived").length,
  };
  const visible = matches.filter(m => m.status === tab);

  const recommended = visible.filter(m => m.source === "recommended");
  const ai = visible.filter(m => m.source === "ai-matched");

  return (
    <section className="bg-gray-50 rounded-2xl p-4">
      <h2 className="text-base font-extrabold">Your matches · {projectTitle}</h2>
      <div className="flex gap-5 mt-3 border-b">
        {(["new", "contacted", "archived"] as const).map(t => {
          const label = t.charAt(0).toUpperCase() + t.slice(1);
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2 text-sm font-bold relative ${tab === t ? "text-gray-900" : "text-gray-500"}`}>
              <span>{label}</span>
              {counts[t] > 0 && (
                <span className="ml-1 text-[10px] font-extrabold bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">
                  {counts[t]}
                </span>
              )}
              {tab === t && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-600 rounded" />}
            </button>
          );
        })}
      </div>

      {visible.length === 0 && <EmptyCopy tab={tab} />}

      {recommended.length > 0 && (
        <>
          <SectionLabel>Recommended by your network</SectionLabel>
          {recommended.map(m => <Row key={m.matchId} m={m} onOpen={onOpen} />)}
        </>
      )}
      {ai.length > 0 && (
        <>
          <SectionLabel>AI-matched</SectionLabel>
          {ai.map(m => <Row key={m.matchId} m={m} onOpen={onOpen} />)}
        </>
      )}
    </section>
  );
}

function EmptyCopy({ tab }: { tab: Tab }) {
  const msg =
    tab === "new" ? "No new matches yet — we'll notify you."
    : tab === "contacted" ? "Builders you've reached out to will appear here."
    : "No archived matches.";
  return <p className="text-center text-sm text-gray-500 py-8">{msg}</p>;
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mt-4 mb-2">{children}</div>;
}
function Row({ m, onOpen }: { m: MatchRow; onOpen: (m: MatchRow) => void }) {
  return (
    <button onClick={() => onOpen(m)}
      className="w-full bg-white rounded-xl border border-gray-100 p-3 mb-2 flex items-center gap-3 text-left">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-300 to-indigo-500 flex items-center justify-center text-white font-bold">
        {m.builderFirstName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{m.builderFirstName}</div>
        <div className="text-xs text-gray-500">{m.companyName} · {m.trades.join(", ")}</div>
        <div className="text-xs text-amber-800 mt-0.5">
          {m.source === "recommended" ? "★ " : "✨ "}{m.whyMatch}
        </div>
      </div>
      <span className="text-gray-400">›</span>
    </button>
  );
}
