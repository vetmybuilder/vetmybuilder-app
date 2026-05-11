// web/components/PilotBlockSheet.tsx
//
// iOS-native bottom sheet shown when a homeowner picks a postcode
// outside our pilot area (Mocks variant A in /mocks/pilot-block-mobile).
// Reused by LocationField when pilotOnly=true.
//
// Behaviour:
//   - Slides up from the bottom with a backdrop scrim.
//   - Dismissable via Got it, backdrop tap, or Escape.
//   - Locks body scroll while open so the page underneath doesn't scroll
//     when the user drags inside the sheet.
//
// We deliberately keep this lightweight - no swipe-down-to-dismiss
// gesture, no spring animation. Easy to upgrade later if needed.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  /** Pre-formatted message body, e.g. "We're piloting in Waltham Forest..." */
  message: string;
  onClose: () => void;
};

export default function PilotBlockSheet({ open, message, onClose }: Props) {
  // Portal target. We mount to document.body so position:fixed on the
  // sheet positions relative to the viewport, not whichever ancestor of
  // LocationField has a transform/filter/perspective set (the wizard
  // shell uses transforms for animation, which would otherwise turn the
  // ancestor into a containing block and trap the sheet inside it).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Lock body scroll while open. Restores on cleanup.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const overlay = (
    <>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="md:hidden fixed inset-0 z-[80] bg-black/40 cursor-default"
        style={{ animation: "pbs-fade 0.2s ease-out" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pbs-title"
        className="md:hidden fixed inset-x-0 bottom-0 z-[81] rounded-t-3xl bg-white shadow-2xl"
        style={{
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "pbs-up 0.28s cubic-bezier(.32,.72,0,1)",
        }}
        data-testid="pilot-block-sheet"
      >
        {/* iOS-style grabber */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="block h-1 w-9 rounded-full bg-zinc-300" />
        </div>

        <div className="px-6 pt-3 pb-2 text-center">
          <div
            aria-hidden
            className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100"
          >
            <span className="text-xl">📍</span>
          </div>
          <h2
            id="pbs-title"
            className="text-[20px] font-extrabold text-slate-900 tracking-[-0.01em]"
          >
            Not in our area yet
          </h2>
          <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl py-3.5 text-[15px] font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:scale-[1.005] active:scale-[0.99] transition-transform"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
            data-testid="pilot-block-sheet-dismiss"
          >
            Got it
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pbs-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pbs-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );

  return createPortal(overlay, document.body);
}
