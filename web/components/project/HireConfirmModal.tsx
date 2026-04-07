// web/components/project/HireConfirmModal.tsx
//
// Confirmation modal shown when a homeowner clicks Hire on a recommendation
// or builder profile. Optional message, single confirm button, error state.
//
// The actual API call is owned by the parent so this component stays dumb
// and reusable for both the recommendation and onboarded-tradesman entry
// points (both POST /api/projects/:id/hires under the hood).

import * as React from "react";
import { X, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  /** Display name of who's being hired (e.g. "Elegant Building Services"). */
  targetName: string;
  /** Async submit handler — receives the optional homeowner message. */
  onConfirm: (message: string) => Promise<void>;
  onClose: () => void;
};

export default function HireConfirmModal({
  open,
  targetName,
  onConfirm,
  onClose,
}: Props) {
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state whenever the modal closes/opens for a different target
  React.useEffect(() => {
    if (!open) {
      setMessage("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(message.trim());
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e?.message || "Failed to send hire request",
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
      aria-labelledby="hire-confirm-title"
      data-testid="hire-confirm-modal"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="hire-confirm-title"
            className="text-xl font-black text-zinc-900"
          >
            Hire {targetName}?
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
          They'll be notified immediately. Verified tradespeople usually respond
          within 24 hours, but availability is limited — act fast.
        </p>

        <div className="mt-4">
          <label
            htmlFor="hire-message"
            className="block text-xs font-bold text-zinc-700"
          >
            Add a message{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            id="hire-message"
            data-testid="hire-confirm-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Hi! I'd like to hire you for my project..."
            className="mt-1 w-full rounded-xl border-2 border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors"
          />
        </div>

        {error && (
          <p
            role="alert"
            data-testid="hire-confirm-error"
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
            data-testid="hire-confirm-submit"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Sending…" : `Confirm hire`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="hire-confirm-cancel"
            className="inline-flex items-center justify-center rounded-full bg-white border-2 border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
