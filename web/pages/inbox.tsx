// web/pages/inbox.tsx
//
// Cross-project pitch inbox for homeowners. Fetches /api/inbox and renders
// a mobile-first list with New/Replied/Dismissed tabs and optimistic
// dismiss / accept-and-reply actions per card.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeft } from "lucide-react";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";

type PitchStatus = "new" | "replied" | "dismissed";

interface PitchRow {
  messageId: string;
  projectId: string | number;
  projectTitle: string;
  builderFirstName: string;
  companyName: string;
  yearsTrading: number;
  outward: string;
  body: string;
  hoursAgo: number;
  status: PitchStatus;
}

const AVATAR_GRADIENTS = [
  "bg-gradient-to-br from-indigo-400 to-indigo-600",
  "bg-gradient-to-br from-emerald-300 to-emerald-500",
  "bg-gradient-to-br from-amber-300 to-amber-500",
  "bg-gradient-to-br from-rose-300 to-rose-500",
  "bg-gradient-to-br from-teal-300 to-teal-600",
];

function avatarGradient(firstName: string): string {
  const ch = (firstName || "?").charAt(0);
  const idx = ch.charCodeAt(0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx] || AVATAR_GRADIENTS[0]!;
}

function buildSubline(row: PitchRow): string {
  const parts: string[] = [];
  if (row.companyName) parts.push(row.companyName);
  if (row.yearsTrading && Number(row.yearsTrading) > 0) {
    parts.push(`${row.yearsTrading} yrs`);
  }
  if (row.outward) parts.push(row.outward);
  return parts.join(" · ");
}

type Tab = PitchStatus;

const EMPTY_COPY: Record<Tab, { title: string; subtitle: string }> = {
  new: {
    title: "No new pitches",
    subtitle: "We'll notify you when a builder reaches out.",
  },
  replied: {
    title: "No replies yet",
    subtitle: "Pitches you've accepted appear here.",
  },
  dismissed: {
    title: "No dismissed pitches",
    subtitle: "Pitches you've dismissed appear here.",
  },
};

function InboxPageInner() {
  const router = useRouter();
  const api = useApi();
  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [tab, setTab] = useState<Tab>("new");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/inbox")
      .then((res) => {
        if (cancelled) return;
        const rows: PitchRow[] = Array.isArray(res.data?.pitches)
          ? res.data.pitches
          : [];
        setPitches(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setPitches([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts: Record<Tab, number> = {
    new: pitches.filter((p) => p.status === "new").length,
    replied: pitches.filter((p) => p.status === "replied").length,
    dismissed: pitches.filter((p) => p.status === "dismissed").length,
  };

  const visible = pitches.filter((p) => p.status === tab);

  function setStatus(messageId: string, status: PitchStatus) {
    setPitches((prev) =>
      prev.map((p) => (p.messageId === messageId ? { ...p, status } : p)),
    );
  }

  function onDismiss(row: PitchRow) {
    setStatus(row.messageId, "dismissed");
    api
      .post(`/api/projects/${row.projectId}/inbox/${row.messageId}/dismiss`, {})
      .catch(() => {
        /* keep optimistic state; a retry affordance can come later */
      });
  }

  function onAccept(row: PitchRow) {
    setStatus(row.messageId, "replied");
    api
      .post(`/api/projects/${row.projectId}/inbox/${row.messageId}/reply`, {})
      .catch(() => {
        /* keep optimistic state */
      });
  }

  const tabDefs: { key: Tab; label: string }[] = [
    { key: "new", label: "New" },
    { key: "replied", label: "Replied" },
    { key: "dismissed", label: "Dismissed" },
  ];

  return (
    <main
      className="min-h-screen bg-white text-gray-900"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      {/* Back nav row */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-[15px] font-bold text-gray-500 tracking-tight">
          Inbox
        </div>
        <div className="w-10" />
      </div>

      {/* Hero */}
      <section className="px-6 pt-2 pb-4 text-center">
        <div className="text-[34px] leading-none mb-2.5" aria-hidden>
          ✉️
        </div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
          Pitches from
          <br />
          builders
        </h1>
        <p className="mt-2.5 mx-4 text-[14px] text-gray-500 leading-[1.5]">
          Builders who paid to reach you directly. Reply to share your contact,
          or dismiss.
        </p>
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1 bg-gray-100 rounded-2xl p-1 mx-5 mb-4"
      >
        {tabDefs.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`py-2 rounded-xl text-[13px] font-extrabold flex items-center justify-center ${
                active
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-500"
              }`}
            >
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`ml-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty state / list */}
      {visible.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-[32px] opacity-60" aria-hidden>
            📭
          </div>
          <div className="text-[16px] font-extrabold text-gray-900 mt-2.5">
            {EMPTY_COPY[tab].title}
          </div>
          <div className="text-[13px] text-gray-500 mt-1.5">
            {EMPTY_COPY[tab].subtitle}
          </div>
        </div>
      ) : (
        <div>
          {visible.map((row) => {
            const isNew = row.status === "new";
            const cardBase =
              "mx-5 mb-3 p-4 bg-white border rounded-[20px]";
            const cardTone = isNew
              ? "border-indigo-200 bg-gradient-to-br from-[#fafbff] via-white to-white"
              : "border-gray-200";
            return (
              <div key={row.messageId} className={`${cardBase} ${cardTone}`}>
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-extrabold text-[15px] shrink-0 ${avatarGradient(
                      row.builderFirstName,
                    )}`}
                    aria-hidden
                  >
                    {(row.builderFirstName || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[15px] font-extrabold text-gray-900 tracking-tight">
                        {row.builderFirstName}
                      </div>
                      <div className="text-[11px] text-gray-400 font-semibold shrink-0">
                        {row.hoursAgo}h
                      </div>
                    </div>
                    <div className="text-[12px] text-gray-500 mt-0.5">
                      {buildSubline(row)}
                    </div>
                    <div className="inline-flex mt-2 bg-indigo-50 text-indigo-700 text-[11px] font-bold px-2.5 py-1 rounded-full max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.projectTitle}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 text-[13px] text-gray-800 leading-[1.5] line-clamp-3">
                  {row.body}
                </div>
                {isNew && (
                  <div className="mt-3.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onDismiss(row)}
                      className="flex-1 py-2.5 rounded-xl bg-white text-gray-500 font-extrabold text-[13px] border-[1.5px] border-gray-200"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => onAccept(row)}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-extrabold text-[13px] border-[1.5px] border-indigo-700 shadow-[0_6px_16px_rgba(99,102,241,0.25)]"
                    >
                      Accept & reply
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function InboxPage() {
  return (
    <AuthedOnly>
      <InboxPageInner />
    </AuthedOnly>
  );
}
