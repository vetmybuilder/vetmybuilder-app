// web/components/ReportModal.tsx
//
// Variant C: compact, "quick flag and move on". Pill-chip categories,
// detail textarea hidden behind an "Add detail" toggle, viewport-aware
// shell (BottomSheet on mobile, centered card on desktop).
//
// Submit is disabled + spinner while in flight.
//
// On success:
//   Mobile  - sheet stays mounted with an inline confirmation block.
//   Desktop - the modal closes and a Toast appears at the bottom-centre
//             of the viewport for 2.5s, then onClose fires.
//
// On ALREADY_REPORTED (or any other error): inline error stays in the
// modal on both viewports so the user can retry / cancel.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import { trackReportSubmitted } from "@/utils/analytics";
import { Flag, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";

type TargetType = "profile" | "recommendation" | "photo";

type Props = {
  targetType: TargetType;
  targetId: string | number;
  onClose: () => void;
};

const CATEGORIES = [
  { value: "abuse", label: "Abusive" },
  { value: "spam", label: "Spam" },
  { value: "fake_review", label: "Fake review" },
  { value: "inappropriate_image", label: "Inappropriate image" },
  { value: "other", label: "Other" },
] as const;

const SUCCESS_TITLE = "Thanks for letting us know";
const SUCCESS_BODY = "We'll review this within 48 hours";
const TOAST_DURATION_MS = 2500;

function CategoryPill({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-50",
        selected
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-amber-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50",
      ].join(" ")}
      aria-pressed={selected}
    >
      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}

function FormBody({
  category,
  setCategory,
  detail,
  setDetail,
  detailOpen,
  setDetailOpen,
  submitting,
  error,
}: {
  category: string;
  setCategory: (v: string) => void;
  detail: string;
  setDetail: (v: string) => void;
  detailOpen: boolean;
  setDetailOpen: (v: boolean) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
          <Flag className="h-4 w-4 text-amber-600" />
        </span>
        <h2
          className="text-[15px] font-extrabold text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Report this profile
        </h2>
      </div>
      <p className="mt-2 text-[12.5px] text-slate-500 leading-relaxed">
        Pick a reason. We'll review within 48 hours and never share your report
        with the profile owner.
      </p>

      <div
        className="mt-3.5 flex flex-wrap gap-1.5"
        data-testid="report-category-list"
      >
        {CATEGORIES.map((c) => (
          <CategoryPill
            key={c.value}
            label={c.label}
            selected={category === c.value}
            onSelect={() => setCategory(c.value)}
            disabled={submitting}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDetailOpen(!detailOpen)}
        disabled={submitting}
        className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-slate-500 hover:text-slate-900 disabled:opacity-50"
      >
        {detailOpen ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" /> Hide detail
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" /> Add detail (optional)
          </>
        )}
      </button>

      {detailOpen && (
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={1000}
          disabled={submitting}
          placeholder="Anything else we should know?"
          className="mt-2 w-full rounded-2xl border-[1.5px] border-amber-100 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 resize-none disabled:opacity-50"
        />
      )}

      {error && (
        <p
          className="mt-3 text-[12.5px] text-rose-600 font-semibold"
          role="alert"
          data-testid="report-error"
        >
          {error}
        </p>
      )}
    </>
  );
}

function SuccessInline({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center py-3" data-testid="report-success">
      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
        <Check className="h-6 w-6 text-emerald-600" strokeWidth={3} />
      </span>
      <h3
        className="text-[16px] font-black text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {SUCCESS_TITLE}
      </h3>
      <p className="mt-1 text-[13px] text-slate-500">{SUCCESS_BODY}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-900 hover:bg-slate-800 px-6 py-2.5 text-[13px] font-bold text-white"
      >
        Close
      </button>
    </div>
  );
}

function SuccessToast({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white text-[13px] font-bold px-5 py-2.5 shadow-lg shadow-emerald-500/30"
        role="status"
        data-testid="report-success-toast"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
        <span>{SUCCESS_TITLE} — {SUCCESS_BODY.toLowerCase()}.</span>
      </div>
    </div>
  );
}

export default function ReportModal({ targetType, targetId, onClose }: Props) {
  const api = useApi();
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!category || submitting) return;
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
      setError(
        code === "ALREADY_REPORTED"
          ? "You've already reported this. We're looking into it."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = submitting ? "Submitting…" : "Submit report";
  const formProps = {
    category,
    setCategory,
    detail,
    setDetail,
    detailOpen,
    setDetailOpen,
    submitting,
    error,
  };

  return (
    <>
      {/* MOBILE — bottom sheet. Stays mounted with inline success on submit. */}
      <div className="md:hidden">
        <BottomSheet
          open={true}
          onClose={onClose}
          ariaLabel="Report this profile"
          sheetTestId="report-modal"
        >
          {submitted ? (
            <div className="px-5 pt-3 pb-5">
              <SuccessInline onClose={onClose} />
            </div>
          ) : (
            <div className="px-5 pt-3 pb-5">
              <FormBody {...formProps} />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!category || submitting}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[14px] font-extrabold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:shadow-none"
                style={{
                  background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                }}
              >
                {submitting && <Spinner />}
                {submitLabel}
              </button>
            </div>
          )}
        </BottomSheet>
      </div>

      {/* DESKTOP — centered popover. On submit success, hide the modal and
          fire a Toast that auto-dismisses + closes after TOAST_DURATION_MS. */}
      <div className="hidden md:block">
        {submitted ? (
          <SuccessToast onDismiss={onClose} />
        ) : (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
            onClick={onClose}
          >
            <div className="flex min-h-full items-start justify-center py-8">
              <div
                className="relative w-full max-w-sm rounded-2xl border border-amber-100 bg-white shadow-xl shadow-amber-200/40 p-4"
                onClick={(e) => e.stopPropagation()}
                data-testid="report-modal"
              >
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="absolute top-2.5 right-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                <FormBody {...formProps} />

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!category || submitting}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-extrabold text-white shadow-md shadow-indigo-500/25 disabled:opacity-50 disabled:shadow-none"
                  style={{
                    background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                  }}
                >
                  {submitting && <Spinner />}
                  {submitLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
