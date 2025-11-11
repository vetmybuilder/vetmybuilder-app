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
  /** needed for unlock_contact one-off checkout */
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
        // fallback to static on error
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

/* ========= Spotlight eligibility (by project budget) ========= */
type JobItemLite = { id: number; budget?: string | null };

function useSpotlightEligibility(
  isOpen: boolean,
  projectId: number | undefined,
  api: ReturnType<typeof useApi>
) {
  const [budget, setBudget] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!(isOpen && projectId));
  const [error, setError] = useState<string | null>(null);

  const ALLOWED: ReadonlyArray<string> = ["£15k–£30k", "£30k–£60k", "£60k+"];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isOpen || !projectId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        // ✅ Use the authenticated API client (adds Bearer token)
        const qs = `order=newest&limit=200`;
        const { data } = await api.get(`/api/tradesmen/jobs?${qs}`);
        const items: JobItemLite[] = Array.isArray(data?.items)
          ? data.items
          : [];

        const match = items.find((it) => Number(it.id) === Number(projectId));
        if (!cancelled) setBudget(match?.budget ?? null);
      } catch (e: any) {
        // If auth fails (401), fall back to allowing Spotlight so UI doesn't break
        const status = e?.response?.status;
        if (!cancelled) {
          setError(
            status === 401
              ? "Unauthorised (missing/invalid token)"
              : e?.message || "Failed to resolve budget"
          );
          setBudget(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, api]);

  // Default-show Spotlight unless we confidently know it's below 15k
  const spotlightAllowed = !projectId
    ? true
    : budget
    ? ALLOWED.includes(budget)
    : false;

  return { spotlightAllowed, budget, loading, error };
}

/* ========= Styles / Icons ========= */
const GOLD_CARD =
  "bg-[linear-gradient(135deg,#E9C46A_0%,#D4AF37_35%,#B8860B_100%)] border-amber-300";
const FREE_CARD = "bg-white text-slate-900 border-slate-200";
const SPOTLIGHT_CARD =
  "bg-[linear-gradient(135deg,#8B5CF6_0%,#EC4899_40%,#F59E0B_100%)] text-white border-fuchsia-300";
const UNLOCK_CARD =
  "bg-[linear-gradient(135deg,#0ea5e9_0%,#22d3ee_45%,#84cc16_100%)] text-white border-cyan-300";

/* icons */
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
  projectId,
}: Props) {
  const api = useApi();
  const router = useRouter();

  const { data: plansData, loading, error } = usePlans(isOpen);
  const PLANS = plansData || STATIC_PLANS;

  const { spotlightAllowed, loading: spotlightLoading } =
    useSpotlightEligibility(isOpen, projectId, api);

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

  const planLabel = (id: PlanId) =>
    id === "unlock_contact"
      ? "Unlock Contact"
      : id === "spotlight"
      ? "Spotlight"
      : id === "gold"
      ? "Gold"
      : "Free";

  // ========= Checkout =========
  async function continueToCheckout() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const plan = (PLANS.plans as ReadonlyArray<AnyPlan>).find(
        (p) => p.id === selected
      );
      if (!plan) {
        setSubmitting(false);
        return;
      }

      const currency = String((PLANS as any)?.currency || "GBP").toUpperCase();
      const typeFromPlan = String(plan?.billing?.type || "free");
      const origin = window.location.origin;

      if (typeFromPlan === "free") {
        onSelect?.(selected);
        onClose();
        return;
      }

      // unlock_contact — one-off per project
      if (selected === "unlock_contact" && projectId) {
        const pounds = Number(plan?.billing?.priceOnce ?? 0);
        if (!Number.isFinite(pounds) || pounds <= 0) {
          console.warn(
            "[plans] invalid unlock price",
            plan?.billing?.priceOnce
          );
          setSubmitting(false);
          return;
        }
        const amountPence = Math.round(pounds * 100);

        const { data } = await api.post("/api/payments/checkout", {
          type: "one_off",
          planId: selected, // ✅ send planId so server can validate
          amountPence, // ✅ explicit amount for one-off
          currency,
          projectId,
          entity_type: "project",
          entity_id: projectId,
          metadata: { type: "unlock_contact", planId: selected, projectId },
          success_url: `${origin}/payments/mock/success?session_id={SESSION_ID}`,
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
        console.warn("[plans] No checkout session returned for unlock_contact");
        setSubmitting(false);
        return;
      }

      // spotlight (one_off) / gold (subscription)
      const payload: any = {
        planId: selected,
        currency,
        origin,
        metadata: { planId: selected },
        success_url: `${origin}/payments/mock/success?session_id={SESSION_ID}`,
        cancel_url: `${origin}/payments/mock/cancel?session_id={SESSION_ID}`,
      };

      if (typeFromPlan === "one_off") {
        const pounds = Number(plan?.billing?.priceOnce ?? 0);
        if (!Number.isFinite(pounds) || pounds <= 0) {
          console.warn(
            "[plans] invalid one_off price",
            plan?.billing?.priceOnce
          );
          setSubmitting(false);
          return;
        }
        payload.type = "one_off";
        payload.amountPence = Math.round(pounds * 100);
        if (plan?.billing?.durationDays)
          payload.metadata.durationDays = plan.billing.durationDays;
      } else {
        const monthly = Number(plan?.billing?.priceMonthly ?? 0);
        if (!Number.isFinite(monthly) || monthly <= 0) {
          console.warn(
            "[plans] invalid subscription price",
            plan?.billing?.priceMonthly
          );
          setSubmitting(false);
          return;
        }
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
      console.warn("[plans] No checkout session returned");
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

  // NEW: can the user pick a given plan?
  const canPickPlan = (id: PlanId, type: string) => {
    const isFree = type === "free";
    // Only allow selecting Free if the current plan is Gold (downgrade path).
    if (isFree) return currentPlanId === "gold";
    // Other plans remain selectable
    return true;
  };

  const cards = useMemo(() => {
    const all = (PLANS.plans as ReadonlyArray<AnyPlan>)
      .slice()
      .sort((a, b) => numericPrice(a) - numericPrice(b));

    // Filter Spotlight based on budget rule (only when we have a project context)
    const filtered = all.filter((p) => {
      if (p.id !== "spotlight") return true;
      // Hide Spotlight while eligibility is loading for a specific project
      if (projectId) return !spotlightLoading && spotlightAllowed;
      // No project context => show
      return true;
    });

    return filtered.map((p) => {
      const id = p.id as PlanId;
      const type = String(p?.billing?.type || "free");
      const isFree = type === "free";
      const isUnlock = id === "unlock_contact";
      const isSpotlight = id === "spotlight";
      const isGold = id === "gold";
      const pickable = canPickPlan(id, type);
      const isSelected = pickable && id === selected;

      const baseCard = isFree
        ? FREE_CARD
        : isUnlock
        ? UNLOCK_CARD
        : isSpotlight
        ? SPOTLIGHT_CARD
        : GOLD_CARD;

      /* price text */
      let priceMain = "";
      let priceSuffix = "";
      if (isFree) priceMain = "Free";
      else if (isUnlock) {
        priceMain = formatPrice(p?.billing?.priceOnce);
        priceSuffix = "one-off · per project";
      } else if (isSpotlight) {
        priceMain = formatPrice(p?.billing?.priceOnce);
        priceSuffix = "one-off · 1 month";
      } else {
        priceMain = formatPrice(p?.billing?.priceMonthly);
        priceSuffix = `per month · Annual: ${formatPrice(
          p?.billing?.priceAnnual
        )}`;
      }

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
            "group flex h-full min-h=[240px] flex-col rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg",
            baseCard,
            "w-full",
            !pickable ? "cursor-not-allowed opacity-95" : "cursor-pointer",
          ].join(" ")}
          onClick={() => {
            if (pickable) setSelected(id);
          }}
          data-testid={`plan-card-${p.id}`}
        >
          {/* top row */}
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
                    <Sparkle className={ICON_BADGE} /> NEW
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/30">
                    Promo
                  </span>
                </>
              )}
              {isGold && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
                  <Star className={`${ICON_BADGE} text-amber-500`} /> Popular
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

          {/* price */}
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

          {/* features / requirements */}
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
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-emerald-600" />
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
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    <span>Companies House verified</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-emerald-600" />
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
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-emerald-600" />
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
                    <span className="mt-[5px] h-2.5 w-2.5 rounded-full bg-white/80" />
                    <span>Companies House verified</span>
                  </li>
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

          {/* choose row */}
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
                checked={!!isSelected}
                disabled={!pickable}
                onChange={() => {
                  if (pickable) setSelected(id);
                }}
              />
              {pickable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pickable) setSelected(id);
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
              )}
            </div>
          </div>
        </div>
      );
    });
  }, [
    PLANS,
    currentPlanId,
    selected,
    projectId,
    spotlightAllowed,
    spotlightLoading,
  ]);

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
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <b>Heads up:</b> All purchases are activated after an{" "}
            <b>admin review</b>.
          </div>
        </div>

        {/* Body */}
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
