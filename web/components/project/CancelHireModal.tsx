// web/components/project/CancelHireModal.tsx
//
// Cancel modal for an accepted hire. Forces the homeowner to pick a reason
// from a canonical list (matches server/lib/hireCancelReasons.js). Used only
// when the hire is in 'accepted' status — for pending hires the parent
// can call the cancel endpoint directly without a reason.

import * as React from "react";
import { X, AlertTriangle } from "lucide-react";

// Mirrors server/lib/hireCancelReasons.js — kept in sync manually because
// duplicating one short list is cheaper than building a fetch+cache for it.
const REASON_OPTIONS = [
  { value: "changed_mind", label: "Changed my mind" },
  { value: "chose_another", label: "Chose a different tradesperson" },
  { value: "project_cancelled", label: "Project is no longer happening" },
  { value: "other", label: "Other" },
] as const;

type Props = {
  open: boolean;
  /** Display name (e.g. "Elegant Building Services"). */
  targetName: string;
  /** Async submit handler — receives the chosen cancel reason. */
  onConfirm: (cancelReason: string) => Promise<void>;
  onClose: () => void;
};

export default function CancelHireModal({
  open,
  targetName,
  onConfirm,
  onClose,
}: Props) {
  const [reason, setReason] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason);
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || "Failed to cancel hire",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-hire-title"
      data-testid="cancel-hire-modal"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="cancel-hire-title"
            className="flex items-center gap-2 text-xl font-black text-zinc-900"
          >
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Cancel hire
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-zinc-600">
          You're cancelling the hire with <strong>{targetName}</strong>.
          They've already accepted, so we'll let them know.
        </p>

        <div className="mt-4">
          <label
            htmlFor="cancel-reason"
            className="block text-xs font-bold text-zinc-700"
          >
            Why are you cancelling?
          </label>
          <select
            id="cancel-reason"
            data-testid="cancel-hire-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-red-400 focus:outline-none transition-colors"
          >
            <option value="">Select a reason…</option>
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p
            role="alert"
            data-testid="cancel-hire-error"
            className="mt-3 text-xs font-semibold text-red-600"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            data-testid="cancel-hire-submit"
            className="inline-flex flex-1 items-center justify-center rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Cancelling…" : "Confirm cancel"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="cancel-hire-back"
            className="inline-flex items-center justify-center rounded-full bg-white border-2 border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
