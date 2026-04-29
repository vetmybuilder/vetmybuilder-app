// web/components/tradesmen/SwipePayGate.tsx
//
// Full-screen pay-gate that opens when an unsubscribed builder right-
// swipes a job on /tradesman/jobs. Replaces the old redirect to
// /tradesman/billing — keeps them in flow with the swiped job pinned
// at the top, three pass options, and a one-off unlock as a secondary
// path. Calls the same /api/subscriptions/checkout and
// /api/projects/:id/unlock-contact/checkout endpoints the standalone
// billing + unlock pages already use.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";

// Inline spinner SVG - matches the pattern used in ReportModal,
// PushPrompt, CloseProjectModal, etc.
function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
    </svg>
  );
}

type TierId = "week_1" | "week_2" | "month_1";

type Tier = {
  id: TierId;
  label: string;          // "7-day pass"
  iconNumber: string;     // "7", "14", "30"
  amountPence: number;
  perDayLabel: string;    // "£0.57 / day"
  blurb: string;          // "Unlimited swipes for 7 days"
  bestValueNote?: string; // shown only on the highlighted tier
};

const TIERS: Tier[] = [
  {
    id: "week_1",
    label: "7-day pass",
    iconNumber: "7",
    amountPence: 399,
    perDayLabel: "£0.57 / day",
    blurb: "Unlimited swipes for 7 days",
  },
  {
    id: "week_2",
    label: "14-day pass",
    iconNumber: "14",
    amountPence: 699,
    perDayLabel: "£0.50 / day",
    blurb: "Unlimited swipes for 14 days",
  },
  {
    id: "month_1",
    label: "30-day pass",
    iconNumber: "30",
    amountPence: 999,
    perDayLabel: "£0.33 / day",
    blurb: "Unlimited swipes for 30 days",
    bestValueNote: "Lowest daily cost",
  },
];

function formatGbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export type SwipePayGateSubject = {
  projectId: number;
  title: string;
  location?: string | null;
  type?: string | null;
  priceBandLabel?: string | null;
};

export default function SwipePayGate({
  open,
  subject,
  onClose,
}: {
  open: boolean;
  subject: SwipePayGateSubject | null;
  /** Closes the gate. Caller should reset its own state. The gate does
   *  not advance the deck — the swiped card stays as the top card so the
   *  builder can re-swipe after subscribing. */
  onClose: () => void;
}) {
  const api = useApi();
  const router = useRouter();

  const [selected, setSelected] = useState<TierId>("month_1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [oneOffPence, setOneOffPence] = useState<number | null>(null);
  // Drives the full-screen pay confirmation overlay shown over the
  // gate during a one-off pay flow:
  //   'activating' - spinner + "Activating your unlock..." while the
  //                  checkout + mock pay calls run
  //   'activated'  - tick + "Unlock activated" briefly (1.2s) before
  //                  navigating to the chat thread
  const [payState, setPayState] = useState<"idle" | "activating" | "activated">(
    "idle",
  );
  const [payAmountLabel, setPayAmountLabel] = useState<string>("");

  // Reset selection + error + pay-state each time the gate opens for
  // a new subject.
  useEffect(() => {
    if (open) {
      setSelected("month_1");
      setErr(null);
      setPayState("idle");
      setPayAmountLabel("");
    }
  }, [open, subject?.projectId]);

  // Best-effort fetch of the per-project one-off price. The unlock-preview
  // endpoint was retired with the inbox; fall back to /api/projects/:id
  // and finally to a £9.99 default.
  useEffect(() => {
    if (!open || !subject) {
      setOneOffPence(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${subject.projectId}`);
        if (cancelled) return;
        const pence = Number(data?.unlockPrice || 0);
        setOneOffPence(pence > 0 ? pence : null);
      } catch {
        if (!cancelled) setOneOffPence(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subject, api]);

  if (!open || !subject) return null;

  const selectedTier = TIERS.find((t) => t.id === selected)!;
  const oneOffLabel = oneOffPence ? formatGbp(oneOffPence) : "£9.99";

  async function startPass() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post("/api/subscriptions/checkout", {
        tier: selected,
      });
      const redirectUrl = res.data?.hosted_url || res.data?.url;
      const isMock = String(redirectUrl || "").includes("/payments/mock/");
      if (redirectUrl && !isMock) {
        // Real Stripe — leave the app
        window.location.href = redirectUrl;
        return;
      }
      // Mock provider activates server-side immediately. Close the gate
      // and let the deck re-fire the swipe; the gate will not reopen
      // because /api/subscriptions/me will now return an active row.
      onClose();
      // Nudge the deck to re-fetch the subscription state.
      try {
        await api.get("/api/subscriptions/me");
      } catch {}
      router.replace(router.asPath);
    } catch (e: any) {
      setErr(
        e?.response?.data?.error ||
          e?.message ||
          "Couldn't start checkout. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startOneOff() {
    if (!subject || busy) return;
    setBusy(true);
    setErr(null);
    setPayState("activating");
    setPayAmountLabel(oneOffLabel);
    try {
      const res = await api.post(
        `/api/projects/${subject.projectId}/unlock-contact/checkout`,
        {},
      );
      // Server returns either:
      //   - real Stripe: hosted_url to checkout.stripe.com
      //   - mock provider: url like "/payments/mock/checkout/{sessionId}"
      // Builder already has an active unlock for this project (e.g.
      // they bought it earlier and bounced away). Server short-circuits
      // to { ok: true, alreadyUnlocked: true, matchId } - route straight
      // into chat.
      if (res.data?.alreadyUnlocked) {
        const matchId = res.data?.matchId;
        // Already-unlocked is a no-op for the wallet but the UX should
        // still feel deliberate: flash the activated state for 600ms
        // then route into the existing chat.
        setPayState("activated");
        await new Promise((r) => setTimeout(r, 600));
        if (matchId) {
          await router.push(`/chat/${matchId}`);
        } else {
          await router.push("/tradesman/jobs/list");
          // eslint-disable-next-line no-console
          console.warn("Already-unlocked response missing matchId");
        }
        onClose();
        return;
      }

      const url = res.data?.url || res.data?.hosted_url;
      const sessionId = res.data?.sessionId;
      if (!url) {
        throw new Error("Checkout URL missing from response");
      }

      // Mock-mode shortcut: trigger the mock pay endpoint server-side
      // (which now creates a matched swipe_interest row source='paid_unlock')
      // then route the builder straight into the chat thread. Real Stripe
      // still gets the full external redirect.
      const isMock = String(url).includes("/payments/mock/");
      if (isMock && sessionId) {
        await api.post("/api/payments/mock/pay", { sessionId });
        // mock.pay does not currently return matchId, so re-hit the
        // checkout endpoint - it now sees the active unlock and replies
        // with { alreadyUnlocked: true, matchId }.
        let matchId: number | string | undefined;
        try {
          const lookup = await api.post(
            `/api/projects/${subject.projectId}/unlock-contact/checkout`,
            {},
          );
          matchId = lookup.data?.matchId;
        } catch {
          /* fall through to fallback */
        }
        // Flash the "Unlock activated" state for ~1.2s so the builder
        // sees confirmation that the £X.XX charge succeeded before the
        // chat thread takes over the screen.
        setPayState("activated");
        await new Promise((r) => setTimeout(r, 1200));
        if (matchId) {
          await router.push(`/chat/${matchId}`);
        } else {
          // eslint-disable-next-line no-console
          console.warn("Could not resolve matchId after paid unlock");
          await router.push("/tradesman/jobs/list");
        }
        onClose();
        return;
      }

      onClose();
      window.location.href = url;
    } catch (e: any) {
      // 409 alreadySubscribed shouldn't happen here (we only show the
      // gate to non-subscribers) but tolerate it: pivot to the pass flow.
      if (
        e?.response?.status === 409 &&
        e?.response?.data?.alreadySubscribed
      ) {
        setPayState("idle");
        onClose();
        router.replace(router.asPath);
        return;
      }
      setPayState("idle");
      setErr(
        e?.response?.data?.error ||
          e?.message ||
          "Couldn't start unlock. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Full-screen pay confirmation overlay - takes over the gate during
  // a one-off pay flow. 'activating' shows a spinner while the unlock
  // is being recorded; 'activated' flashes the green tick + amount-
  // charged badge briefly so the builder sees confirmation before the
  // chat thread loads.
  if (payState !== "idle") {
    const activating = payState === "activating";
    return (
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center px-8 text-center"
        data-testid="swipe-paygate-confirm"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-5 text-white"
          style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          aria-hidden
        >
          {activating ? (
            <Spinner className="h-10 w-10" />
          ) : (
            <span className="text-[40px] font-black leading-none">✓</span>
          )}
        </div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight">
          {activating ? "Activating your unlock…" : "Unlock activated"}
        </h1>
        <p className="mt-2 text-[12.5px] text-slate-500 leading-snug max-w-[300px]">
          {activating
            ? "We're recording the payment and opening a chat thread with the homeowner."
            : "You can now message the homeowner directly. Loading the chat…"}
        </p>
        <div
          className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full"
          data-testid="swipe-paygate-confirm-amount"
        >
          <span>✓</span> {payAmountLabel} charged
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col"
      data-testid="swipe-paygate"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <div style={{ height: "env(safe-area-inset-top)" }} />

      {/* Top bar */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-slate-100 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 text-[13px] font-bold flex items-center gap-1"
          data-testid="swipe-paygate-back"
        >
          ← Back
        </button>
        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
          Pitch this job
        </span>
        <span className="w-[44px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Hero */}
        <div className="px-5 pt-5 pb-3 text-center">
          <div
            className="w-12 h-12 rounded-full text-white flex items-center justify-center mx-auto text-xl font-black"
            style={{
              background: "linear-gradient(135deg,#10b981,#059669)",
            }}
            aria-hidden
          >
            ♥
          </div>
          <h2 className="mt-3 text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight">
            You like this one!
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-500 leading-snug max-w-[300px] mx-auto">
            Pick a pass to pitch this job - and every other matching job while
            it's active.
          </p>
        </div>

        {/* Pinned card */}
        <div className="mx-5 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
          <div
            className="px-3.5 pt-3 pb-2.5 text-white"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            <div className="text-[15px] font-extrabold leading-tight">
              {subject.title}
            </div>
            <div className="mt-1 text-[11px] text-white/85">
              {[subject.type, subject.location, subject.priceBandLabel]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>

        {/* Tier list */}
        <div
          className="px-5 mt-4 space-y-2"
          role="radiogroup"
          aria-label="Choose a pass"
          data-testid="swipe-paygate-tiers"
        >
          {TIERS.map((t) => {
            const isSelected = selected === t.id;
            const isBest = t.id === "month_1";
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(t.id)}
                data-testid={`swipe-paygate-tier-${t.id}`}
                className={`relative w-full rounded-2xl p-3 flex items-center gap-3 text-left transition-colors ${
                  isSelected
                    ? "border-[2px] border-violet-500 bg-violet-50/60 ring-4 ring-violet-100"
                    : "border-[1.5px] border-slate-200 bg-white"
                }`}
              >
                {isBest && (
                  <span
                    className="absolute -top-2 right-3 text-white text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                    }}
                  >
                    BEST VALUE
                  </span>
                )}
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-black shrink-0 ${
                    isBest
                      ? "text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                  style={
                    isBest
                      ? {
                          background:
                            "linear-gradient(135deg,#6366f1,#4f46e5)",
                        }
                      : undefined
                  }
                  aria-hidden
                >
                  {t.iconNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-extrabold text-slate-900">
                    {t.label}
                  </div>
                  <div
                    className={`text-[11px] ${
                      isBest && t.bestValueNote
                        ? "text-violet-700 font-bold"
                        : "text-slate-500"
                    }`}
                  >
                    {isBest && t.bestValueNote ? t.bestValueNote : t.blurb}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] font-extrabold text-slate-900">
                    {formatGbp(t.amountPence)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t.perDayLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* One-off block */}
        <div className="mx-5 mt-5 mb-5 rounded-2xl bg-amber-50/60 border border-amber-200/70 p-3.5">
          <div className="flex items-center gap-2 text-[10.5px] font-extrabold text-amber-700 uppercase tracking-wider">
            <span aria-hidden>⚡</span> One-off, no pass
          </div>
          <div className="mt-1 text-[13.5px] font-extrabold text-slate-900 leading-tight">
            Just pitch this one job
          </div>
          <div className="text-[11.5px] text-slate-600 leading-snug mt-1">
            Unlock the homeowner's contact for this job only. Price scales with
            the project value.
          </div>
          <button
            type="button"
            onClick={startOneOff}
            disabled={busy}
            data-testid="swipe-paygate-oneoff"
            className="mt-3 w-full py-2.5 rounded-xl bg-white border-[1.5px] border-amber-400 text-amber-700 font-extrabold text-[13px] disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? "Opening…" : `Pay ${oneOffLabel} one-off`}
          </button>
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="px-5 py-3 border-t border-slate-100 bg-white shrink-0"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={startPass}
          disabled={busy}
          data-testid="swipe-paygate-cta"
          className="w-full py-3 rounded-2xl text-white font-extrabold text-[14px] shadow-lg shadow-indigo-200 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg,#6366f1,#4f46e5)",
          }}
        >
          {busy && <Spinner className="h-4 w-4" />}
          {busy
            ? "Activating…"
            : `Get ${selectedTier.label} · ${formatGbp(selectedTier.amountPence)}`}
        </button>
        {err && (
          <p
            className="mt-2 text-center text-[12px] text-red-600 font-semibold"
            role="alert"
          >
            {err}
          </p>
        )}
        <p className="text-[10px] text-slate-400 text-center mt-2 leading-snug">
          One-time purchase. No auto-renewal - buy a new pass when this one
          expires.
        </p>
      </div>
    </div>
  );
}
