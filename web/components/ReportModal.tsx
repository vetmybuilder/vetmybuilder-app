// web/components/ReportModal.tsx
import { useState } from "react";
import { useApi } from "@/utils/api";
import { trackReportSubmitted } from "@/utils/analytics";

type TargetType = "profile" | "recommendation" | "photo";

type Props = {
  targetType: TargetType;
  targetId: string | number;
  onClose: () => void;
};

const CATEGORIES = [
  { value: "abuse", label: "Abusive or threatening content" },
  { value: "spam", label: "Spam or advertising" },
  { value: "fake_review", label: "Fake or misleading review" },
  { value: "inappropriate_image", label: "Inappropriate image" },
  { value: "other", label: "Other" },
] as const;

export default function ReportModal({ targetType, targetId, onClose }: Props) {
  const api = useApi();
  const [category, setCategory] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.post("/api/reports", {
        targetType,
        targetId: String(targetId),
        category,
        detail: detail.trim() || undefined,
      });
      trackReportSubmitted(targetType, category);
      setSubmitted(true);
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === "ALREADY_REPORTED") {
        setError("You've already reported this. We're looking into it.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center py-8">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="report-modal"
      >
        {submitted ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-zinc-900">Thanks for letting us know</h2>
            <p className="mt-2 text-sm text-zinc-500">
              We'll review this within 48 hours. If we need more information, we'll be in touch.
            </p>
            <button
              onClick={onClose}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-zinc-900">Report an issue</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Let us know what's wrong and we'll review it.
            </p>

            <form className="mt-4 space-y-4" onSubmit={onSubmit}>
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-700 mb-2">What's the issue?</legend>
                <div className="space-y-2">
                  {CATEGORIES.map((cat) => (
                    <label
                      key={cat.value}
                      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${
                        category === cat.value
                          ? "border-red-400 bg-red-50"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-category"
                        value={cat.value}
                        checked={category === cat.value}
                        onChange={() => setCategory(cat.value)}
                        className="h-4 w-4 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-sm text-zinc-700">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="report-detail" className="block text-sm font-semibold text-zinc-700 mb-1">
                  Additional details (optional)
                </label>
                <textarea
                  id="report-detail"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Tell us more about what you've seen..."
                  className="w-full rounded-xl border-2 border-zinc-200 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 font-medium" role="alert">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border-2 border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!category || submitting}
                  className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-red-500/25 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "Submitting..." : "Submit report"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
