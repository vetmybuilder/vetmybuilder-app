import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { PLANS as STATIC_PLANS } from "@/shared/lib/plans";
import type { PlanId } from "@/shared/lib/plans";

/* ========= Types ========= */
type PlansResponse = typeof STATIC_PLANS;
type AnyPlan = PlansResponse["plans"][number] & {
  billing?: {
    type?: "free" | "subscription" | "one_off" | string;
    priceMonthly?: number | string;
    priceAnnual?: number | string;
    priceOnce?: number | string;
    durationDays?: number;
    trialDays?: number;
  };
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (planId: PlanId) => void;
  currentPlanId?: PlanId;
  defaultSelectedPlanId?: PlanId;

  /** NEW: needed for unlock_contact one-off checkout */
  projectId?: number;
};

/* ========= Data fetch (plans) ========= */
function usePlans(isEnabled: boolean) {
  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(isEnabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isEnabled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/meta/plans", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PlansResponse;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) {
          setData(STATIC_PLANS);
          setError(e?.message || "Failed to fetch plans; using defaults.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEnabled]);

  return { data, loading, error };
}

/* ========= Styles / Icons ========= */
const GOLD_CARD =
  "bg-[linear-gradient(135deg,#E9C46A_0%,#D4AF37_35%,#B8860B_100%)] border-amber-300";
const FREE_CARD = "bg-white text-slate-900 border-slate-200";
const SPOTLIGHT_CARD =
  "bg-[linear-gradient(135deg,#8B5CF6_0%,#EC4899_40%,#F59E0B_100%)] text-white border-fuchsia-300";
const UNLOCK_CARD =
  "bg-[linear-gradient(135deg,#0ea5e9_0%,#22d3ee_45%,#84cc16_100%)] text-white border-cyan-300";

/* Uniform icon sizes */
const ICON_TICK = "h-5 w-5";
const ICON_CROSS = "h-5 w-5";
const ICON_BADGE = "h-3.5 w-3.5";
const ICON_PILL = "h-4 w-4";

const Tick = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M7.6 13.3L3.3 9l1.4-1.4l2.9 2.9l7.1-7.1l1.4 1.4z"
      fill="currentColor"
    />
  </svg>
);
const Cross = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={className}>
    <path
      d="M6 6l8 8M14 6l-8 8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const Star = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      fill="currentColor"
      d="M12 3l3.09 6.26L22 10l-5 4.88L18.18 21L12 17.56L5.82 21L7 14.88L2 10l6.91-.74z"
    />
  </svg>
);
const Sparkle = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      fill="currentColor"
      d="M12 2l2.2 4.5L19 8.7l-4.2 2.1L12 15l-2.8-4.2L5 8.7l4.8-2.2L12 2zm8 10l1.3 2.6L24 16l-2.7 1.3L20 20l-1.3-2.7L16 16l2.7-1.4L20 12z"
    />
  </svg>
);
const FreeGlyph = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      fill="currentColor"
      d="M12 3l9 6v6l-9 6l-9-6V9l9-6m0 2.2L5 9v6l7 4.8L19 15V9l-7-3.8Z"
    />
  </svg>
);

/* ========= Component ========= */
export default function PlansModal({
  isOpen,
  onClose,
  onSelect,
  currentPlanId,
  defaultSelectedPlanId,
  projectId, // NEW
}: Props) {
  const api = useApi();
  const router = useRouter();

  const { data: plansData, loading, error } = usePlans(isOpen);
  const PLANS = plansData || STATIC_PLANS;

  const [selected, setSelected] = useState<PlanId | null>(
    defaultSelectedPlanId || null
  );
  const [submitting, setSubmitting] = useState(false);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(defaultSelectedPlanId || null);
  }, [isOpen, defaultSelectedPlanId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const formatPrice = (value: number | string | undefined) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    return `£${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
  };

  const planLabel = (id: PlanId) => {
    switch (id) {
      case "unlock_contact":
        return "Unlock Contact";
      case "spotlight":
        return "Spotlight";
      case "gold":
        return "Gold";
      case "free":
      default:
        return "Free";
    }
  };

  // Checkout (subscription vs one-off; unlock_contact uses project-scoped flow)
  async function continueToCheckout() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const plan = (PLANS.plans as ReadonlyArray<AnyPlan>).find(
        (p) => p.id === selected
      );
      if (!plan) throw new Error("Selected plan not found");

      const currency = String((PLANS as any)?.currency || "GBP").toUpperCase();
      const type = String(plan?.billing?.type || "free");
      const origin = window.location.origin;

      // Free -> no payment
      if (type === "free") {
        onSelect?.(selected);
        onClose();
        return;
      }

      // Special-case: unlock_contact one-off tied to a specific project
      if (selected === "unlock_contact" && projectId) {
        const pounds = Number(plan?.billing?.priceOnce ?? 0);
        if (!Number.isFinite(pounds) || pounds <= 0)
          throw new Error("Invalid one-off price");
        const amount = Math.round(pounds * 100);

        const { data } = await api.post("/api/payments/checkout", {
          projectId,
          entity_type: "project",
          entity_id: projectId,
          items: [
            {
              label: "Unlock homeowner contact",
              price: { amount, currency },
              quantity: 1,
            },
          ],
          metadata: { type: "unlock_contact", projectId },
          success_url: `${origin}/payments/mock/success?session_id={SESSION_ID}`, // existing flow
          cancel_url: `${origin}/payments/mock/cancel?session_id={SESSION_ID}`,
        });

        const url =
          data?.url || data?.session?.hosted_url || data?.hosted_url || null;
        const sid =
          data?.sessionId ||
          data?.session_id ||
          data?.id ||
          data?.session?.id ||
          null;

        if (url) {
          window.location.href = url;
          return;
        }
        if (sid) {
          await router.push(
            `/payments/mock/checkout/${encodeURIComponent(sid)}`
          );
          return;
        }
        throw new Error("No checkout session returned");
      }

      // Generic one_off (e.g., Spotlight) or subscription (Gold)
      const payload: any = {
        planId: selected,
        currency,
        origin,
        metadata: { planId: selected },
        success_url: `${origin}/payments/mock/success?session_id={SESSION_ID}`,
        cancel_url: `${origin}/payments/mock/cancel?session_id={SESSION_ID}`,
      };

      if (type === "one_off") {
        const pounds = Number(plan?.billing?.priceOnce ?? 0);
        if (!Number.isFinite(pounds) || pounds <= 0)
          throw new Error("Invalid one-off price");
        payload.type = "one_off";
        payload.amountPence = Math.round(pounds * 100);
        if (plan?.billing?.durationDays)
          payload.metadata.durationDays = plan.billing.durationDays;
      } else {
        const monthly = Number(plan?.billing?.priceMonthly ?? 0);
        if (!Number.isFinite(monthly) || monthly <= 0)
          throw new Error("Invalid subscription price");
        payload.type = "subscription";
        payload.amountPence = Math.round(monthly * 100);
        payload.metadata.cadence = "monthly";
      }

      const { data } = await api.post("/api/payments/checkout", payload);
      const url =
        data?.url || data?.session?.hosted_url || data?.hosted_url || null;
      const sid =
        data?.sessionId ||
        data?.session_id ||
        data?.id ||
        data?.session?.id ||
        null;

      if (url) {
        window.location.href = url;
        return;
      }
      if (sid) {
        await router.push(`/payments/mock/checkout/${encodeURIComponent(sid)}`);
        return;
      }
      throw new Error("No checkout session returned");
    } catch (e: any) {
      console.error(
        "[plans] checkout failed:",
        e?.response?.data || e?.message || e
      );
    } finally {
      setSubmitting(false);
    }
  }

  const numericPrice = (p: AnyPlan) => {
    const t = String(p?.billing?.type || "free");
    if (t === "free") return 0;
    if (t === "one_off") return Number(p?.billing?.priceOnce ?? Infinity);
    if (t === "subscription")
      return Number(p?.billing?.priceMonthly ?? Infinity);
    return Number.POSITIVE_INFINITY;
  };

  const cards = useMemo(() => {
    const list = (PLANS.plans as ReadonlyArray<AnyPlan>)
      .slice()
      .sort((a, b) => numericPrice(a) - numericPrice(b));

    return list.map((p) => {
      const id = p.id as PlanId;
      const type = String(p?.billing?.type || "free");
      const isFree = type === "free";
      const isUnlock = id === "unlock_contact";
      const isSpotlight = id === "spotlight";
      const isGold = id === "gold";
      const isSelected = id === selected;

      const baseCard = isFree
        ? FREE_CARD
        : isUnlock
        ? UNLOCK_CARD
        : isSpotlight
        ? SPOTLIGHT_CARD
        : GOLD_CARD;

      let priceMain = "";
      let priceSuffix = "";
      if (isFree) {
        priceMain = "Free";
      } else if (isUnlock) {
        priceMain = formatPrice(p?.billing?.priceOnce);
        priceSuffix = "one-off · per project";
      } else if (isSpotlight) {
        priceMain = formatPrice(p?.billing?.priceOnce); // e.g. £39.99
        priceSuffix = "one-off · 1 month";
      } else if (isGold) {
        priceMain = formatPrice(p?.billing?.priceMonthly);
        const annual = formatPrice(p?.billing?.priceAnnual);
        priceSuffix = `per month · Annual: ${annual}`;
      }

      const featureText =
        isUnlock || isSpotlight
          ? "text-[13px] text-white"
          : "text-[13px] text-black";

      const Bullet = ({ light }: { light?: boolean }) => (
        <span
          className={[
            "mt-[5px] h-2.5 w-2.5 flex-shrink-0 rounded-full",
            light ? "bg-white/80" : "bg-emerald-600",
          ].join(" ")}
        />
      );

      return (
        <div
          key={p.id}
          className={[
            "group flex h-full min-h=[240px] flex-col rounded-xl border p-3",
            "transition-all hover:-translate-y-0.5 hover:shadow-lg",
            baseCard,
            "w-full",
          ].join(" ")}
          onClick={() => setSelected(id)}
          data-testid={`plan-card-${p.id}`}
        >
          {/* Top row */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div
              className={[
                "inline-flex items-center gap-1.5 rounded-full",
                isFree
                  ? "bg-slate-100 px-2.5 py-0.5"
                  : isUnlock || isSpotlight
                  ? "bg-white/15 px-2.5 py-0.5 ring-1 ring-white/25"
                  : "bg-white/85 px-2.5 py-0.5 ring-1 ring-white/60",
              ].join(" ")}
            >
              {isFree ? (
                <FreeGlyph className={`${ICON_PILL} text-slate-500`} />
              ) : isUnlock ? (
                <svg viewBox="0 0 24 24" className={`${ICON_PILL} text-white`}>
                  <path
                    fill="currentColor"
                    d="M12 17a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm6-6h-1V9a5 5 0 0 0-10 0h2a3 3 0 0 1 6 0v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z"
                  />
                </svg>
              ) : (
                <Star
                  className={`${ICON_PILL} ${
                    isSpotlight ? "text-white" : "text-amber-500"
                  }`}
                />
              )}
              <span
                className={
                  isFree
                    ? "text-slate-800 text-[12px] font-semibold"
                    : isUnlock || isSpotlight
                    ? "text-white text-[12px] font-semibold"
                    : "text-black text-[12px] font-semibold"
                }
              >
                {isFree
                  ? "Free / Basic"
                  : isUnlock
                  ? "Unlock Contact"
                  : isSpotlight
                  ? "Spotlight"
                  : "Gold"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {isSpotlight && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/30">
                    <Sparkle className={ICON_BADGE} />
                    NEW
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/30">
                    Promo
                  </span>
                </>
              )}
              {isGold && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
                  <Star className={`${ICON_BADGE} text-amber-500`} />
                  Popular
                </span>
              )}
              {currentPlanId === id && (
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    isUnlock || isSpotlight
                      ? "bg-white/15 text-white ring-1 ring-white/25"
                      : "bg-emerald-100 text-emerald-700",
                  ].join(" ")}
                >
                  Current
                </span>
              )}
            </div>
          </div>

          {/* Price */}
          <div
            className={[
              "mb-3 flex flex-wrap items-baseline gap-2",
              isUnlock || isSpotlight ? "text-white" : "text-black",
            ].join(" ")}
          >
            <div className="text-[26px] font-extrabold leading-none tracking-tight">
              {priceMain}
            </div>
            {!isFree && (
              <div className="text-[12px] opacity-90">{priceSuffix}</div>
            )}
          </div>

          {/* Features */}
          {isFree && (
            <>
              <ul className="mb-3 space-y-1.5 text-slate-900">
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-emerald-600`} />
                  <span className="text-[13px] text-black font-semibold">
                    Share your profile to home owners
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Cross className={`${ICON_CROSS} text-rose-600`} />
                  <span className="text-[13px] text-black">
                    Discoverable by home owners
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Cross className={`${ICON_CROSS} text-rose-600`} />
                  <span className="text-[13px] text-black">
                    Ranked against other trades
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Cross className={`${ICON_CROSS} text-rose-600`} />
                  <span className="text-[13px] text-black">
                    Contact home owners
                  </span>
                </li>
              </ul>

              <div className="mt-1">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-black/70">
                  NICE TO HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-black">
                  <li className="flex items-start gap-2">
                    <Bullet />
                    <span>Social / Web presence</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {isGold && (
            <>
              <ul className="mb-3 space-y-1.5">
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-emerald-800`} />
                  <span className="text-[13px] text-black">
                    Share your profile to home owners
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-emerald-800`} />
                  <span className="text-[13px] text-black">
                    Discoverable across the site
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-emerald-800`} />
                  <span className="text-[13px] text-black">
                    Ranked against other trades
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-emerald-800`} />
                  <span className="text-[13px] text-black">
                    Contact homeowners
                  </span>
                </li>
              </ul>

              <div className="mt-1">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-black/70">
                  MUST HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-black">
                  <li className="flex items-start gap-2">
                    <Bullet />
                    <span>Companies House verified</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Bullet />
                    <span>Valid insurance</span>
                  </li>
                </ul>
              </div>

              <div className="mt-2">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-black/70">
                  NICE TO HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-black">
                  <li className="flex items-start gap-2">
                    <Bullet />
                    <span>Social / Web presence</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {isSpotlight && (
            <>
              <p className="mb-3 text-[13.5px] leading-5 text-white/95">
                Get showcased on a dedicated <b>Featured Trades</b> page seen by
                project owners. Your best work and wins are highlighted.
              </p>
              <ul className="mb-3 space-y-1.5">
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-white`} />
                  <span className="text-[13px] text-white">
                    Prominent placement on owners’ Featured list
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-white`} />
                  <span className="text-[13px] text-white">
                    Available on <b>£15k+ projects only</b>
                  </span>
                </li>
              </ul>

              <div className="mt-1">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
                  MUST HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-white">
                  <li className="flex items-start gap-2">
                    <Bullet light />
                    <span>Companies House verified</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Bullet light />
                    <span>Valid insurance</span>
                  </li>
                </ul>
              </div>

              <div className="mt-2">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
                  NICE TO HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-white">
                  <li className="flex items-start gap-2">
                    <Bullet light />
                    <span>Social / Web presence</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {isUnlock && (
            <>
              <p className="mb-3 text-[13.5px] leading-5 text-white/95">
                One-off purchase to <b>reveal the owner’s contact details</b>{" "}
                for this project.
              </p>
              <ul className="mb-3 space-y-1.5">
                <li className="flex items-start gap-2">
                  <Tick className={`${ICON_TICK} text-white`} />
                  <span className="text-[13px] text-white">
                    Works with your current plan
                  </span>
                </li>
              </ul>

              <div className="mt-1">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
                  MUST HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-white">
                  <li className="flex items-start gap-2">
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-white/80" />
                    <span>Valid insurance</span>
                  </li>
                </ul>
              </div>

              <div className="mt-2">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
                  NICE TO HAVE
                </div>
                <ul className="space-y-2 text-[13px] text-white">
                  <li className="flex items-start gap-2">
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-white/80" />
                    <span>Social / Web presence</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          <div className="mt-auto" />

          {/* Choose button row */}
          <div className="mt-3 flex items-center justify-between">
            <div
              className={
                isUnlock || isSpotlight
                  ? "text-xs text-white/90"
                  : isFree
                  ? "text-xs text-slate-600"
                  : "text-xs text-black/85"
              }
            >
              {isFree
                ? "Start with the basics"
                : isUnlock
                ? "Contact revealed after review"
                : isSpotlight
                ? "Be seen first by serious owners"
                : "Unlock full visibility & contact"}
            </div>
            <div className="flex items-center gap-2">
              <input
                id={`plan-${p.id}`}
                name="plan"
                type="radio"
                className="sr-only"
                checked={isSelected}
                onChange={() => setSelected(id)}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(id);
                }}
                className={[
                  "h-9 rounded-full px-4 text-xs font-semibold transition focus:outline-none",
                  isUnlock || isSpotlight
                    ? "bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/20"
                    : isFree
                    ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                    : "bg-[rgba(0,0,0,0.35)] text-white hover:bg-[rgba(0,0,0,0.45)]",
                ].join(" ")}
              >
                {isSelected ? "Selected" : "Choose"}
              </button>
            </div>
          </div>
        </div>
      );
    });
  }, [PLANS, currentPlanId, selected]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plans-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === backdropRef.current) onClose();
        }}
      />

      {/* Panel */}
      <div className="relative z-[1001] mx-4 w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex flex-col gap-3 p-5 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <h2
                id="plans-title"
                className="text-xl font-semibold tracking-tight text-slate-900"
              >
                Choose your plan
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Plans are reviewed by an admin before activation.
              </p>
              {error && (
                <p className="mt-2 text-xs text-amber-700">Note: {error}</p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="group -mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M18.3 5.71L12 12.01l-6.3-6.3l-1.4 1.41l6.29 6.29l-6.3 6.3l1.41 1.41l6.3-6.29l6.29 6.29l1.41-1.41l-6.29-6.3l6.29-6.29z"
                />
              </svg>
            </button>
          </div>

          {/* Review highlight */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <b>Heads up:</b> All purchases are activated after an{" "}
            <b>admin review</b>.
          </div>
        </div>

        {/* Body (single-row, horizontal scroll if needed) */}
        <div className="px-5 py-5 overflow-x-auto overflow-y-hidden">
          <div className="grid grid-cols-4 gap-3 min-w-[1100px]">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[240px] w-full animate-pulse rounded-xl border border-slate-200/80 p-3 shadow-sm"
                  />
                ))
              : cards}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={continueToCheckout}
            className="h-9 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-900/90"
          >
            {submitting
              ? "Starting checkout…"
              : selected
              ? `Continue with ${planLabel(selected)}`
              : "Select a plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
