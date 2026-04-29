import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import AuthedOnly from "@/components/AuthedOnly";

type TierId = "week_1" | "week_2" | "month_1";

const TIERS: { id: TierId; label: string; price: string; priceBig: string; perDay: string; sub: string }[] = [
  { id: "week_1", label: "7-day", price: "£3.99", priceBig: "£3.99", perDay: "£0.57 / day", sub: " / 7 days" },
  { id: "week_2", label: "14-day", price: "£6.99", priceBig: "£6.99", perDay: "£0.50 / day", sub: " / 14 days" },
  { id: "month_1", label: "30-day", price: "£9.99", priceBig: "£9.99", perDay: "£0.33 / day · lowest daily cost", sub: " / 30 days" },
];

export default function BillingPage() {
  return (
    <AuthedOnly>
      <BillingPageInner />
    </AuthedOnly>
  );
}

function BillingPageInner() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [tier, setTier] = useState<TierId>("month_1");
  const [current, setCurrent] = useState<{ tier: TierId; renewsAt: string } | null>(null);
  // `loaded = true` once we've finished the initial /api/subscriptions/me
  // fetch. We hold off rendering the picker / current-plan panel until then
  // so a subscribed user doesn't see a flash of the picker on reload.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    api
      .get("/api/subscriptions/me")
      .then((r) => {
        if (cancelled) return;
        setCurrent(r.data?.subscription ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrent(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const selected = TIERS.find((t) => t.id === tier)!;

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post("/api/subscriptions/checkout", { tier });
      // Server returns `hosted_url` for both Stripe and mock providers.
      // For real Stripe checkout we redirect there; for the dev mock the
      // subscription is already activated server-side by the time the
      // POST resolves, so we just refresh local state and bounce to the
      // jobs deck (the most common entry point via the gate).
      const redirectUrl = res.data?.hosted_url || res.data?.url;
      const isMock = String(redirectUrl || "").includes("/payments/mock/");
      if (redirectUrl && !isMock) {
        window.location.href = redirectUrl;
        return;
      }
      const me = await api.get("/api/subscriptions/me");
      setCurrent(me.data?.subscription ?? null);
      router.push("/tradesman/jobs");
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

  async function cancel() {
    if (!confirm("Cancel subscription? You'll stay visible until the end of your paid period.")) return;
    try {
      await api.post("/api/subscriptions/cancel", {});
      setCurrent(null);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't cancel. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-white px-5 py-6">
      <div className="text-center mt-2">
        <h1 className="text-2xl font-extrabold">Visibility pass</h1>
        <p className="mt-1 text-[12px] text-gray-500">
          Be seen by homeowners in your area. One-time purchase, no auto-renewal.
        </p>
      </div>

      {!loaded ? (
        <div className="mt-12 text-center text-sm text-gray-400">Loading…</div>
      ) : current ? (
        <div className="mt-8 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5 text-center">
          <div className="font-bold">
            Active pass: {TIERS.find((t) => t.id === current.tier)?.label}
          </div>
          <div className="text-sm text-gray-700 mt-1">
            Expires {new Date(current.renewsAt).toLocaleDateString()}
          </div>
          <button onClick={cancel} className="mt-4 text-sm text-red-600 underline">
            End pass early
          </button>
          <div className="mt-5">
            <button
              onClick={() => router.push("/tradesman/jobs")}
              className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-extrabold"
            >
              Back to jobs
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative grid grid-cols-3 gap-1 bg-gray-100 rounded-2xl p-1 mt-6">
            {TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTier(t.id)}
                className={`relative py-3 rounded-xl text-sm font-bold ${
                  tier === t.id ? "bg-white shadow text-gray-900" : "text-gray-500"
                }`}
              >
                {t.id === "month_1" && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow">
                    Best value
                  </span>
                )}
                <div>{t.label}</div>
                <div aria-hidden="true" className="text-[10px] font-semibold text-gray-500 mt-1">
                  {t.price}
                </div>
              </button>
            ))}
          </div>

          <div className="text-center mt-8">
            <div className="text-5xl font-black tracking-tight">
              {selected.priceBig}
              <span className="text-base font-bold text-gray-500">{selected.sub}</span>
            </div>
            <div className="text-xs text-gray-500 mt-2">{selected.perDay}</div>
          </div>

          <ul className="mt-6 space-y-3">
            <Benefit>Appear in homeowner swipe feeds - AI-ranked by job match</Benefit>
            <Benefit>Free chat on every match - no per-job fee</Benefit>
            <Benefit>Unlimited right-swipes while your pass is active</Benefit>
            <Benefit>One-time purchase - no auto-renewal, no surprise charges</Benefit>
          </ul>

          <div className="mt-8">
            <button
              onClick={subscribe}
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-lg shadow-indigo-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy
                ? "Activating…"
                : `Get ${selected.label} pass - ${selected.priceBig}`}
            </button>
            {err && (
              <p className="mt-3 text-center text-[12px] text-red-600 font-semibold">
                {err}
              </p>
            )}
            <p className="text-[11px] text-gray-500 text-center mt-3">
              One-time purchase. No auto-renewal - buy a new pass when this one expires.
            </p>
          </div>

          {/* Alt-pay footnote: signposts the per-project paid-pitch path
              for builders who don't want a recurring commitment. The
              actual "Pitch this homeowner" CTA lives on each project
              page (see TradesmanProjectView dual-CTA panel). */}
          <div className="mt-6 p-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">
              Or pay-as-you-go
            </div>
            <p className="text-[12px] text-gray-600 leading-snug">
              Want to pitch a single homeowner without a subscription? Open the
              project and use <strong>"Pitch this homeowner"</strong> there.
            </p>
          </div>
        </>
      )}
    </main>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-extrabold">✓</span>
      <span className="text-sm text-gray-800">{children}</span>
    </li>
  );
}
