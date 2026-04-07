// web/components/tradesmen/HireRequestCard.tsx
//
// One hire-request card on the tradesman dashboard. Renders project context,
// the homeowner trust signal, and (when status === 'pending') accept/decline
// buttons that expand into an optional-message form before submitting.

import * as React from "react";
import { useApi } from "@/utils/api";
import { CheckCircle2, XCircle, Clock, MapPin, Home, Bed } from "lucide-react";

export type HireRequest = {
  id: number;
  projectId: number;
  status:
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled"
    | "expired"
    | "pending_invite";
  homeownerMessage: string | null;
  tradesmanMessage: string | null;
  hiredAt: string;
  respondedAt: string | null;
  expiresAt: string;
  project: {
    id: number;
    name: string;
    location: string;
    type: string;
    propertyType: string;
    bedrooms: number;
    ownerFirstName: string | null;
    completedProjectsCount: number;
  };
};

type Props = {
  hire: HireRequest;
  /** Called after a successful accept/decline so the parent can refetch. */
  onResponded?: () => void;
};

type ResponseMode = null | "accept" | "decline";

export default function HireRequestCard({ hire, onResponded }: Props) {
  const api = useApi();

  const [mode, setMode] = React.useState<ResponseMode>(null);
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const homeownerName = hire.project.ownerFirstName || "A homeowner";

  const isPending = hire.status === "pending";

  async function submitResponse() {
    if (!mode) return;
    setSubmitting(true);
    setError(null);

    const path = `/api/hires/${hire.id}/${mode}`;
    try {
      await api.patch(path, {
        tradesmanMessage: message.trim() || undefined,
      });
      setMode(null);
      setMessage("");
      onResponded?.();
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e?.message ||
          `Failed to ${mode} hire request`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function cancelResponse() {
    setMode(null);
    setMessage("");
    setError(null);
  }

  return (
    <article
      data-testid={`hire-request-card-${hire.id}`}
      className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <StatusBadge status={hire.status} />
        <span className="text-xs text-zinc-400">
          {formatRelative(hire.hiredAt)}
        </span>
      </div>

      <h3 className="text-lg font-bold text-zinc-900">{hire.project.name}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
        {hire.project.type && (
          <span className="inline-flex items-center gap-1">
            {hire.project.type}
          </span>
        )}
        {hire.project.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {hire.project.location}
          </span>
        )}
        {hire.project.propertyType && (
          <span className="inline-flex items-center gap-1">
            <Home className="h-3.5 w-3.5" />
            {hire.project.propertyType}
          </span>
        )}
        {hire.project.bedrooms > 0 && (
          <span className="inline-flex items-center gap-1">
            <Bed className="h-3.5 w-3.5" />
            {hire.project.bedrooms} {hire.project.bedrooms === 1 ? "bed" : "beds"}
          </span>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-stone-50 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">
          {homeownerName} hired you
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {hire.project.completedProjectsCount > 0 ? (
            <>
              {homeownerName} has {hire.project.completedProjectsCount}{" "}
              completed project
              {hire.project.completedProjectsCount === 1 ? "" : "s"} on
              VetMyBuilder
            </>
          ) : (
            <>{homeownerName} is new to VetMyBuilder</>
          )}
        </p>
      </div>

      {hire.homeownerMessage && (
        <blockquote className="mt-3 border-l-2 border-red-300 pl-3 text-sm italic text-zinc-700">
          “{hire.homeownerMessage}”
        </blockquote>
      )}

      {/* Pending — show action buttons or response form */}
      {isPending && mode === null && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("accept")}
            data-testid={`hire-request-accept-${hire.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Accept
          </button>
          <button
            type="button"
            onClick={() => setMode("decline")}
            data-testid={`hire-request-decline-${hire.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white border-2 border-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            Decline
          </button>
        </div>
      )}

      {isPending && mode !== null && (
        <div className="mt-4 space-y-3">
          <label
            htmlFor={`hire-msg-${hire.id}`}
            className="block text-xs font-bold text-zinc-700"
          >
            Add a message{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            id={`hire-msg-${hire.id}`}
            data-testid={`hire-request-message-${hire.id}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={
              mode === "accept"
                ? "Looking forward to working with you..."
                : "Sorry, I'm fully booked..."
            }
            className="w-full rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
          />

          {error && (
            <p
              role="alert"
              data-testid={`hire-request-error-${hire.id}`}
              className="text-xs font-semibold text-red-600"
            >
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitResponse}
              disabled={submitting}
              data-testid={`hire-request-confirm-${hire.id}`}
              className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                mode === "accept"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {submitting
                ? "Submitting…"
                : mode === "accept"
                  ? "Confirm Accept"
                  : "Confirm Decline"}
            </button>
            <button
              type="button"
              onClick={cancelResponse}
              disabled={submitting}
              data-testid={`hire-request-cancel-${hire.id}`}
              className="inline-flex items-center justify-center rounded-full bg-white border-2 border-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Already responded — show the tradesman's own message if they left one */}
      {!isPending && hire.tradesmanMessage && (
        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs text-zinc-600">
          <span className="font-semibold text-zinc-700">Your reply:</span>{" "}
          {hire.tradesmanMessage}
        </div>
      )}
    </article>
  );
}

/* ---------- helpers ---------- */

function StatusBadge({ status }: { status: HireRequest["status"] }) {
  const config: Record<
    HireRequest["status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    pending: {
      label: "New request",
      className: "bg-amber-100 text-amber-800",
      icon: <Clock className="h-3 w-3" />,
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
      label: "Cancelled by homeowner",
      className: "bg-zinc-100 text-zinc-700",
      icon: <XCircle className="h-3 w-3" />,
    },
    expired: {
      label: "Expired",
      className: "bg-zinc-100 text-zinc-500",
      icon: <Clock className="h-3 w-3" />,
    },
    pending_invite: {
      label: "Awaiting invite",
      className: "bg-blue-100 text-blue-800",
      icon: <Clock className="h-3 w-3" />,
    },
  };

  const c = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${c.className}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.max(0, Math.floor((now - then) / 1000));
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return "";
  }
}
