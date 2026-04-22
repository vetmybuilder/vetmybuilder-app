// web/components/project/CancelHireModal.tsx
//
// Cancel modal for an accepted hire. Forces the homeowner to pick a reason
// from a canonical list (matches server/lib/hireCancelReasons.js). Used only
// when the hire is in 'accepted' status - for pending hires the parent
// can call the cancel endpoint directly without a reason.

import * as React from "react";

// Mirrors server/lib/hireCancelReasons.js - kept in sync manually because
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
  /** Async submit handler - receives the chosen cancel reason. */
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-hire-title"
      data-testid="cancel-hire-modal"
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden animate-modal-in">
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 text-white">
          <h2
            id="cancel-hire-title"
            className="text-lg font-bold tracking-tight"
          >
            Cancel hire
          </h2>
          <p className="mt-1 text-sm text-red-100">
            You're cancelling the hire with {targetName}.
            They've already accepted, so we'll let them know.
          </p>
        </div>

        <div className="px-6 py-5">
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

          {error && (
            <p
              role="alert"
              data-testid="cancel-hire-error"
              className="mt-3 text-xs font-semibold text-red-600"
            >
              {error}
            </p>
          )}

          <div className="border-t border-zinc-100 pt-5 mt-6 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              data-testid="cancel-hire-back"
              className="inline-flex flex-1 items-center justify-center rounded-full bg-white border-2 border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              data-testid="cancel-hire-submit"
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed ${submitting ? "bg-zinc-400" : "bg-red-500 hover:bg-red-600 active:scale-95 disabled:opacity-60"}`}
            >
              {submitting && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
              {submitting ? "Cancelling…" : "Confirm cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
