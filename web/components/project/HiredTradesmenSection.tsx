// web/components/project/HiredTradesmenSection.tsx
//
// "Hired tradesmen" section on the homeowner project page. Lists every hire
// the homeowner has made for this project (any status), with a status badge
// and a Cancel button on hires that haven't yet hit a terminal state.
//
// Pre-acceptance cancels (pending / pending_invite) go through directly with
// no reason. Post-acceptance cancels open the CancelHireModal to capture a
// canonical reason.

import * as React from "react";
import { useApi } from "@/utils/api";
import CancelHireModal from "./CancelHireModal";
import {
  Briefcase,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  AlertCircle,
} from "lucide-react";

type HireItem = {
  id: number;
  projectId: number;
  tradesmanUserId: string | null;
  recommendationId: number | null;
  status:
    | "pending"
    | "pending_invite"
    | "accepted"
    | "declined"
    | "cancelled"
    | "expired";
  homeownerMessage: string | null;
  tradesmanMessage: string | null;
  cancelReason: string | null;
  hiredAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string;
  displayName: string;
  tradesmanCompanyName: string | null;
  invitedCompanyName: string | null;
  inviteChannel: "email" | "manual" | null;
  tradesmanAvatarUrl: string | null;
};

type Props = {
  projectId: number;
  /**
   * Bumped by the parent whenever a new hire is created so this section
   * refetches and displays the new row immediately.
   */
  refreshKey?: number;
};

const CANCELLABLE: HireItem["status"][] = [
  "pending",
  "pending_invite",
  "accepted",
];

export default function HiredTradesmenSection({
  projectId,
  refreshKey = 0,
}: Props) {
  const api = useApi();

  const [hires, setHires] = React.useState<HireItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = React.useState<HireItem | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const VISIBLE_LIMIT = 3;

  const fetchHires = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/projects/${projectId}/hires`);
      setHires(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || "Failed to load hires",
      );
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  React.useEffect(() => {
    fetchHires();
  }, [fetchHires, refreshKey]);

  // Cancel a pending / pending_invite hire directly (no reason needed)
  async function cancelPendingHire(hire: HireItem) {
    try {
      await api.patch(`/api/hires/${hire.id}/cancel`, {});
      await fetchHires();
    } catch (e: any) {
      // Surface a basic error — the section error banner is fine for this case
      setError(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to cancel hire",
      );
    }
  }

  // Cancel an accepted hire with a reason (via modal)
  async function cancelAcceptedHire(reason: string) {
    if (!cancelTarget) return;
    await api.patch(`/api/hires/${cancelTarget.id}/cancel`, {
      cancelReason: reason,
    });
    setCancelTarget(null);
    await fetchHires();
  }

  // Don't render anything until we know whether there are any hires
  if (loading) {
    return (
      <section
        className="rounded-2xl border border-zinc-200 bg-white p-5"
        data-testid="hired-tradesmen-loading"
      >
        <p className="text-sm text-zinc-500">Loading hired tradesmen…</p>
      </section>
    );
  }

  // Don't render an empty section — too noisy on a fresh project
  if (!loading && hires.length === 0 && !error) {
    return null;
  }

  return (
    <section
      aria-label="Hired tradesmen"
      data-testid="hired-tradesmen-section"
    >
      <div className="mb-3 flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-1.5 w-fit">
        <Briefcase className="h-5 w-5 text-red-500" />
        <h2 className="text-xl font-bold text-zinc-900">Hires</h2>
        <span className="inline-flex items-center justify-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-bold text-zinc-700">
          {hires.length}
        </span>
      </div>

      {error && (
        <div
          className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          data-testid="hired-tradesmen-error"
        >
          {error}
        </div>
      )}

      <div className="space-y-3">
        {(showAll ? hires : hires.slice(0, VISIBLE_LIMIT)).map((hire) => {
          const isCancellable = CANCELLABLE.includes(hire.status);
          const needsReason = hire.status === "accepted";

          return (
            <article
              key={hire.id}
              data-testid={`hired-tradesman-${hire.id}`}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {hire.tradesmanAvatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={hire.tradesmanAvatarUrl}
                      alt={hire.displayName}
                      className="h-12 w-12 rounded-xl object-cover ring-1 ring-zinc-200"
                    />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-stone-100 text-base font-bold text-zinc-700">
                      {(hire.displayName?.[0] ?? "T").toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate text-sm font-bold text-zinc-900"
                      title={hire.displayName}
                    >
                      {hire.displayName}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <StatusBadge
                        status={hire.status}
                        inviteChannel={hire.inviteChannel}
                      />
                      <span className="text-[11px] text-zinc-400">
                        {hire.hiredAt ? new Date(hire.hiredAt).toLocaleDateString("en-GB") : ""}
                      </span>
                    </div>

                    {hire.homeownerMessage ? (
                      <p className="mt-1.5 text-[11px] text-zinc-500 line-clamp-1">
                        You: &quot;{hire.homeownerMessage}&quot;
                      </p>
                    ) : null}
                    {hire.tradesmanMessage ? (
                      <p className="mt-1 text-[11px] italic text-zinc-500 line-clamp-1">
                        Reply: &quot;{hire.tradesmanMessage}&quot;
                      </p>
                    ) : null}
                  </div>
                </div>

                {isCancellable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (needsReason) {
                        setCancelTarget(hire);
                      } else {
                        cancelPendingHire(hire);
                      }
                    }}
                    data-testid={`hired-tradesman-cancel-${hire.id}`}
                    className="shrink-0 inline-flex items-center justify-center rounded-full border-2 border-zinc-200 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {hires.length > VISIBLE_LIMIT && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            data-testid="hired-tradesmen-toggle"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
          >
            {showAll
              ? "View less"
              : `View more (${hires.length - VISIBLE_LIMIT})`}
          </button>
        </div>
      )}

      <CancelHireModal
        open={cancelTarget !== null}
        targetName={cancelTarget?.displayName || ""}
        onConfirm={cancelAcceptedHire}
        onClose={() => setCancelTarget(null)}
      />
    </section>
  );
}

/* ---------- helpers ---------- */

function StatusBadge({
  status,
  inviteChannel,
}: {
  status: HireItem["status"];
  inviteChannel: HireItem["inviteChannel"];
}) {
  const config: Record<
    HireItem["status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    pending: {
      label: "Awaiting response",
      className: "bg-amber-100 text-amber-800",
      icon: <Clock className="h-3 w-3" />,
    },
    pending_invite: {
      label:
        inviteChannel === "email"
          ? "Invite sent"
          : "Awaiting outreach",
      className: "bg-blue-100 text-blue-800",
      icon: <Mail className="h-3 w-3" />,
    },
    accepted: {
      label: "Accepted",
      className: "bg-emerald-100 text-emerald-800",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    declined: {
      label: "Declined",
      className: "bg-zinc-100 text-zinc-700",
      icon: <XCircle className="h-3 w-3" />,
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-zinc-100 text-zinc-700",
      icon: <XCircle className="h-3 w-3" />,
    },
    expired: {
      label: "Expired",
      className: "bg-zinc-100 text-zinc-500",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };

  const c = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.className}`}
      data-testid="hired-tradesman-status"
    >
      {c.icon}
      {c.label}
    </span>
  );
}
