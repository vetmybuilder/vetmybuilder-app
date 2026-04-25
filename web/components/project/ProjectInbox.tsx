import { useState } from "react";
import { useApi } from "@/utils/api";

export interface PitchRow {
  messageId: string;
  builderFirstName: string;
  companyName: string;
  yearsTrading: number;
  outward: string;
  body: string;
  hoursAgo: number;
  status: "new" | "replied" | "dismissed";
}

type Tab = "new" | "replied" | "dismissed";
const TAB_LABELS: Record<Tab, string> = { new: "New", replied: "Replied", dismissed: "Dismissed" };

export default function ProjectInbox({
  projectId,
  pitches: initial,
}: {
  projectId: string;
  pitches: PitchRow[];
}) {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("new");
  const [pitches, setPitches] = useState<PitchRow[]>(initial);

  const counts = {
    new: pitches.filter(p => p.status === "new").length,
    replied: pitches.filter(p => p.status === "replied").length,
    dismissed: pitches.filter(p => p.status === "dismissed").length,
  };
  const visible = pitches.filter(p => p.status === tab);

  async function dismiss(messageId: string) {
    setPitches(ps => ps.map(p => p.messageId === messageId ? { ...p, status: "dismissed" } : p));
    await api.post(`/api/projects/${projectId}/inbox/${messageId}/dismiss`, {});
  }
  async function acceptReply(messageId: string) {
    setPitches(ps => ps.map(p => p.messageId === messageId ? { ...p, status: "replied" } : p));
    await api.post(`/api/projects/${projectId}/inbox/${messageId}/reply`, {});
  }

  return (
    <section className="bg-gray-50 rounded-2xl p-4 mt-4">
      <h2 className="text-base font-extrabold">Inbox · Cold pitches</h2>
      <div className="flex gap-5 mt-3 border-b" role="tablist">
        {(["new", "replied", "dismissed"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}
            className={`py-2 text-sm font-bold relative ${tab === t ? "text-gray-900" : "text-gray-500"}`}>
            <span>{TAB_LABELS[t]}</span>
            {counts[t] > 0 && (
              <span className="ml-1 text-[10px] font-extrabold bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">
                {counts[t]}
              </span>
            )}
            {tab === t && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-600 rounded" />}
          </button>
        ))}
      </div>

      {visible.length === 0 && <EmptyCopy tab={tab} />}

      {visible.map(p => (
        <div key={p.messageId} className="bg-white rounded-xl border border-gray-100 p-4 mt-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-300 to-indigo-500 flex items-center justify-center text-white font-bold">
              {p.builderFirstName.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">{p.builderFirstName}</div>
              <div className="text-xs text-gray-500">
                {p.companyName} · {p.yearsTrading} yrs · {p.outward}
              </div>
            </div>
            <div className="text-xs text-gray-400">{p.hoursAgo}h</div>
          </div>
          <p className="text-sm text-gray-800 mt-3 line-clamp-3">{p.body}</p>
          {tab === "new" && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => dismiss(p.messageId)}
                className="flex-1 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 text-xs font-extrabold">
                Dismiss
              </button>
              <button onClick={() => acceptReply(p.messageId)}
                className="flex-1 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold">
                Accept &amp; reply
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function EmptyCopy({ tab }: { tab: Tab }) {
  const msg =
    tab === "new" ? "No new pitches."
    : tab === "replied" ? "Pitches you've accepted appear here."
    : "Dismissed pitches appear here.";
  return <p className="text-center text-sm text-gray-500 py-8">{msg}</p>;
}
