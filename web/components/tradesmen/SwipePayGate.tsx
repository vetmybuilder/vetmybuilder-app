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

  // Suppress the bottom-right TradesmanMessagingDock while the gate is
  // visible. The dock listens for `vmb:fullscreen-modal` events with
  // `{open: bool}` and hides itself when open is true. Cleanup fires
  // false on unmount so the dock reappears the moment the gate closes.
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(
      new CustomEvent("vmb:fullscreen-modal", { detail: { open: true } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("vmb:fullscreen-modal", { detail: { open: false } }),
      );
    };
  }, [open]);

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
        // Already-unlocked: surface the confirmation page rather than
        // chat - under the boost-slot model the swipe_interest is still
        // 'pending' until the homeowner reciprocates. Pass projectId so
        // the confirmation page can show which job the boost is on.
        setPayState("activated");
        await new Promise((r) => setTimeout(r, 600));
        await router.push(`/tradesman/unlock/sent?projectId=${subject.projectId}`);
        onClose();
        return;
      }

      const url = res.data?.url || res.data?.hosted_url;
      const sessionId = res.data?.sessionId;
      if (!url) {
        throw new Error("Checkout URL missing from response");
      }

      // Mock-mode shortcut: trigger the mock pay endpoint server-side
      // (which now writes a 'pending' swipe_interest row source='paid_unlock')
      // then route to the confirmation page so the trade understands their
      // card has landed in the homeowner's deck and they're awaiting a
      // mutual right-swipe before chat opens.
      const isMock = String(url).includes("/payments/mock/");
      if (isMock && sessionId) {
        await api.post("/api/payments/mock/pay", { sessionId });
        // Flash the "Unlock activated" state for ~1.2s so the builder
        // sees confirmation that the £X.XX charge succeeded before the
        // confirmation page takes over. Pass projectId so the
        // confirmation page can pin which job the boost is on.
        setPayState("activated");
        await new Promise((r) => setTimeout(r, 1200));
        await router.push(`/tradesman/unlock/sent?projectId=${subject.projectId}`);
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
  // a one-off pay flow. On desktop a centered modal card; on mobile the
  // existing full-bleed white screen so phone hardware feels native.
  if (payState !== "idle") {
    const activating = payState === "activating";
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-white md:bg-black/40"
        data-testid="swipe-paygate-confirm"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="w-full md:max-w-md md:bg-white md:rounded-3xl md:shadow-2xl md:border md:border-amber-100 md:px-8 md:py-10 flex flex-col items-center text-center">
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
          <h1
            className="text-[22px] font-black tracking-tight text-slate-900 leading-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {activating ? "Activating your unlock…" : "Unlock activated"}
          </h1>
          <p className="mt-2 text-[13px] text-slate-500 leading-snug max-w-[320px]">
            {activating
              ? "We're recording the payment and opening a chat thread with the homeowner."
              : "You can now message the homeowner directly. Loading the chat…"}
          </p>
          <div
            className="mt-5 inline-flex items-center gap-1.5 text-[11.5px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full"
            data-testid="swipe-paygate-confirm-amount"
          >
            <span>✓</span> {payAmountLabel} charged
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-white md:bg-[#fef6e9] flex flex-col md:items-center md:justify-center md:p-6 overflow-y-auto"
      data-testid="swipe-paygate"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      {/* DESKTOP — V2 pricing-page layout. Inline render below; mobile
          is the existing vertical stack. */}
      <DesktopGate
        subject={subject}
        selected={selected}
        onSelect={setSelected}
        onClose={onClose}
        startPass={startPass}
        startOneOff={startOneOff}
        busy={busy}
        err={err}
        oneOffLabel={oneOffLabel}
      />

      {/* MOBILE — existing full-bleed vertical stack, untouched. */}
      <div className="md:hidden flex-1 flex flex-col">
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
    </div>
  );
}

/* ─── Desktop V2 layout ─────────────────────────────────────────────
   Pricing-page style: pinned job strip + 3-column tier cards (BEST
   VALUE elevated middle) + horizontal one-off + close button. Renders
   only at md+ via the wrapping `hidden md:block`. */
function DesktopGate({
  subject,
  selected,
  onSelect,
  onClose,
  startPass,
  startOneOff,
  busy,
  err,
  oneOffLabel,
}: {
  subject: SwipePayGateSubject;
  selected: TierId;
  onSelect: (id: TierId) => void;
  onClose: () => void;
  startPass: () => void;
  startOneOff: () => void;
  busy: boolean;
  err: string | null;
  oneOffLabel: string;
}) {
  const selectedTier = TIERS.find((t) => t.id === selected)!;

  return (
    <div className="hidden md:block w-full max-w-5xl mx-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-amber-100 overflow-hidden relative">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          data-testid="swipe-paygate-back"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-[16px] z-10 transition-colors"
        >
          ✕
        </button>

        <div className="px-8 py-7">
          {/* Hero copy */}
          <div className="text-center max-w-xl mx-auto">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-1">
              Pitch this job
            </div>
            <h1
              className="text-[28px] font-black tracking-tight text-slate-900 leading-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              You like{" "}
              <span
                className="text-emerald-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
              >
                this one!
              </span>
            </h1>
            <p className="mt-2 text-[13.5px] text-slate-500">
              Pick a pass to pitch this job - and every other matching job while
              it&rsquo;s active.
            </p>
          </div>

          {/* Pinned job strip */}
          <div className="mt-5 mx-auto max-w-2xl">
            <div className="rounded-2xl overflow-hidden border border-amber-100 bg-white shadow-sm">
              <div
                className="px-4 py-3 text-white"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                      Pitching
                    </div>
                    <div className="text-[15px] font-extrabold leading-tight truncate">
                      {subject.title}
                    </div>
                  </div>
                  <div className="text-[11px] text-white/85 shrink-0 text-right">
                    {[subject.type, subject.location, subject.priceBandLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tier cards */}
          <div
            className="mt-7 grid grid-cols-3 gap-4 items-end"
            role="radiogroup"
            aria-label="Choose a pass"
            data-testid="swipe-paygate-tiers"
          >
            {TIERS.map((t) => (
              <DesktopTierCard
                key={t.id}
                tier={t}
                selected={selected === t.id}
                onSelect={() => onSelect(t.id)}
                disabled={busy}
              />
            ))}
          </div>

          {/* CTA + one-off */}
          <div className="mt-7 mx-auto max-w-2xl">
            <button
              type="button"
              onClick={startPass}
              disabled={busy}
              data-testid="swipe-paygate-cta"
              className="w-full py-3.5 rounded-2xl text-white font-extrabold text-[15px] shadow-lg shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none hover:brightness-105 active:brightness-95 inline-flex items-center justify-center gap-2 transition-all"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              {busy && <Spinner className="h-4 w-4" />}
              {busy
                ? "Activating…"
                : `Get ${selectedTier.label} · ${formatGbp(selectedTier.amountPence)}`}
            </button>

            {err && (
              <p
                className="mt-3 text-center text-[12.5px] text-red-600 font-semibold"
                role="alert"
              >
                {err}
              </p>
            )}

            <div className="mt-4 rounded-2xl bg-amber-50/60 border border-amber-200/70 p-3.5 flex items-center gap-3">
              <div
                className="shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 text-base"
                aria-hidden
              >
                ⚡
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10.5px] font-extrabold text-amber-700 uppercase tracking-wider">
                  One-off, no pass
                </div>
                <div className="text-[13px] font-extrabold text-slate-900">
                  Just pitch this one job - {oneOffLabel}
                </div>
                <div className="text-[11.5px] text-slate-600">
                  Unlock the homeowner&rsquo;s contact for this job only.
                </div>
              </div>
              <button
                type="button"
                onClick={startOneOff}
                disabled={busy}
                data-testid="swipe-paygate-oneoff"
                className="shrink-0 px-4 py-2 rounded-full text-[12.5px] font-extrabold text-amber-800 bg-white border-[1.5px] border-amber-400 hover:bg-amber-50 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
              >
                {busy && <Spinner className="h-4 w-4" />}
                {busy ? "Opening…" : `Pay ${oneOffLabel}`}
              </button>
            </div>

            <p className="mt-4 text-[11px] text-slate-400 text-center leading-snug">
              One-time purchase. No auto-renewal - buy a new pass when this one
              expires.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopTierCard({
  tier,
  selected,
  onSelect,
  disabled,
}: {
  tier: Tier;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const isBest = tier.id === "month_1";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      data-testid={`swipe-paygate-tier-${tier.id}`}
      className={`relative bg-white text-left rounded-3xl border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
        isBest
          ? "p-6 -mt-4 border-emerald-300 shadow-lg shadow-emerald-100"
          : "p-5 border-amber-100"
      } ${
        selected
          ? "ring-4 ring-emerald-100 border-emerald-500"
          : "hover:shadow-md hover:border-emerald-200"
      }`}
    >
      {isBest && (
        <span
          className="absolute -top-2.5 left-6 text-white text-[10px] font-black tracking-wider px-2.5 py-0.5 rounded-full"
          style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
        >
          BEST VALUE
        </span>
      )}
      <div className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
        {tier.label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`font-black text-slate-900 ${isBest ? "text-[36px]" : "text-[30px]"}`}
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {formatGbp(tier.amountPence)}
        </span>
      </div>
      <div className="text-[11.5px] text-slate-500 mb-4">{tier.perDayLabel}</div>

      <ul className="space-y-1.5 mb-4">
        <Bullet>{tier.blurb}</Bullet>
        <Bullet>Pitch every matching job</Bullet>
        <Bullet>Free chat on every match</Bullet>
        {isBest && <Bullet emphasised>Lowest cost per day</Bullet>}
      </ul>

      <div
        className={`w-full text-center py-2.5 rounded-xl text-[13px] font-extrabold transition-colors ${
          selected
            ? "text-white"
            : isBest
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-emerald-700"
        }`}
        style={selected ? { background: "linear-gradient(135deg,#10b981,#059669)" } : undefined}
      >
        {selected ? `Selected · ${tier.label}` : `Choose ${tier.label}`}
      </div>
    </button>
  );
}

function Bullet({
  children,
  emphasised,
}: {
  children: React.ReactNode;
  emphasised?: boolean;
}) {
  return (
    <li className={`flex items-start gap-1.5 text-[12px] ${emphasised ? "text-emerald-700 font-bold" : "text-slate-700"}`}>
      <span className="text-emerald-600 font-black shrink-0">✓</span>
      <span>{children}</span>
    </li>
  );
}
