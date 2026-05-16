// web/components/ComingSoonSheet.tsx
//
// Modal shown when a homeowner taps a "Coming soon" project category in
// /projects/new. Two purposes:
//
//   1. Capture an anonymous "tap" demand signal the moment the sheet
//      opens, so admin can see which disabled categories are most-wanted.
//   2. Offer the user a lightweight opt-in (email or postcode) so we can
//      notify them when the category goes live. The opt-in fires a
//      second POST with notify=true; admin sees this as `optedInCount`.
//
// Mirrors PilotBlockSheet's iOS-style bottom-sheet UX on mobile, but
// drops `md:hidden` so the same component is reused on the desktop
// picker - the wizard runs on both surfaces.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";

type Props = {
  open: boolean;
  category: string;
  onClose: () => void;
};

async function logSignalPublic(payload: {
  category: string;
  email?: string;
  notify?: boolean;
}) {
  try {
    await fetch("/api/demand-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fail-quiet - this is a best-effort lead capture, not a critical
    // path. If the network drops the user still gets their "Coming soon"
    // message, just without analytics.
  }
}

export default function ComingSoonSheet({ open, category, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Logged-in vs guest changes the entire UX:
  //   - Logged in: we already have an email on file. Tap-on-open auto
  //     opts them in via the authed API call. No form, just a clear
  //     confirmation message.
  //   - Guest: optional email field. Tap-on-open is anonymous; submit
  //     captures the email as an opted-in lead.
  const { user, loading: authLoading } = useAuth();
  const isLoggedIn = !authLoading && !!user;
  const api = useApi();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fire the tap signal exactly once per open. A ref-keyed guard so
  // re-renders inside the sheet don't trigger duplicate POSTs.
  //   - Logged in: authed call so server picks up user_uid + auto-opt-in
  //   - Guest: anonymous public call
  const tapLoggedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (authLoading) return;
    if (tapLoggedFor.current === category) return;
    tapLoggedFor.current = category;
    if (isLoggedIn) {
      api.post("/api/demand-signal", { category }).catch(() => {});
    } else {
      logSignalPublic({ category });
    }
  }, [open, category, authLoading, isLoggedIn, api]);

  // Reset form state when the sheet closes so reopening on a different
  // category doesn't leak the previous tile's input.
  useEffect(() => {
    if (open) return;
    setEmail("");
    setSubmitted(false);
    setSubmitting(false);
    tapLoggedFor.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const hasEmail = email.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasEmail || submitting) return;
    setSubmitting(true);
    await logSignalPublic({
      category,
      email: email.trim(),
      notify: true,
    });
    setSubmitting(false);
    setSubmitted(true);
  }

  const overlay = (
    <>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/40 cursor-default"
        style={{ animation: "css-fade 0.2s ease-out" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="css-title"
        className="fixed inset-x-0 bottom-0 z-[81] rounded-t-3xl bg-white shadow-2xl md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-[90vw] md:rounded-3xl"
        style={{
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "css-up 0.28s cubic-bezier(.32,.72,0,1)",
        }}
        data-testid="coming-soon-sheet"
      >
        {/* iOS-style grabber (mobile only) */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <span className="block h-1 w-9 rounded-full bg-zinc-300" />
        </div>

        <div className="px-6 pt-3 pb-2 text-center">
          <div
            aria-hidden
            className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100"
          >
            <span className="text-xl">🚧</span>
          </div>
          <h2
            id="css-title"
            className="text-[20px] font-extrabold text-slate-900 tracking-[-0.01em]"
          >
            {submitted
              ? "Thanks - we'll be in touch"
              : `${category} is coming soon`}
          </h2>
          <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
            {submitted
              ? `We'll email you the moment ${category} jobs go live.`
              : isLoggedIn
                ? `Your interest in ${category} has been recorded. We're working hard to bring more tradespeople onto the platform so we can help you - we'll email you the moment ${category} is live.`
                : `We're not yet accepting ${category} jobs. Leave your email below and we'll let you know the moment we open up.`}
          </p>
        </div>

        {!submitted && !isLoggedIn && (
          <form onSubmit={handleSubmit} className="px-5 pt-3 pb-1 space-y-2.5">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
              data-testid="coming-soon-email"
            />
            <button
              type="submit"
              disabled={!hasEmail || submitting}
              className="w-full rounded-2xl py-3.5 text-[15px] font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:scale-[1.005] active:scale-[0.99] transition-transform disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
              data-testid="coming-soon-notify"
            >
              {submitting ? "Saving..." : "Notify me when it's live"}
            </button>
          </form>
        )}

        <div className="px-5 pt-3 pb-1">
          {submitted || isLoggedIn ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl py-3.5 text-[15px] font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:scale-[1.005] active:scale-[0.99] transition-transform"
              style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
              data-testid="coming-soon-dismiss"
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl py-3 text-[14px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              data-testid="coming-soon-dismiss"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes css-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes css-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (min-width: 768px) {
          @keyframes css-up {
            from { opacity: 0; transform: translate(-50%, -45%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
          }
        }
      `}</style>
    </>
  );

  return createPortal(overlay, document.body);
}
