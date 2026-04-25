import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";

type TierId = "week_1" | "week_2" | "month_1";

const TIERS: { id: TierId; label: string; price: string; priceBig: string; perWeek: string; sub: string }[] = [
  { id: "week_1", label: "Week", price: "£3.99", priceBig: "£3.99", perWeek: "£3.99 / week", sub: "/wk" },
  { id: "week_2", label: "2 weeks", price: "£5.99", priceBig: "£5.99", perWeek: "£3.00 / week · save 25%", sub: "/2wks" },
  { id: "month_1", label: "Month", price: "£9.99", priceBig: "£9.99", perWeek: "£2.50 / week · save 37%", sub: "/mo" },
];

export default function BillingPage() {
  const api = useApi();
  const [tier, setTier] = useState<TierId>("month_1");
  const [current, setCurrent] = useState<{ tier: TierId; renewsAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/api/subscriptions/me").then(r => {
      if (!cancelled) setCurrent(r.data.subscription);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = TIERS.find(t => t.id === tier)!;

  async function subscribe() {
    const res = await api.post("/api/subscriptions/checkout", { tier });
    if (res.data?.url) window.location.href = res.data.url;
  }

  async function cancel() {
    if (!confirm("Cancel subscription? You'll stay visible until the end of your paid period.")) return;
    await api.post("/api/subscriptions/cancel", {});
    setCurrent(null);
  }

  return (
    <AuthedOnly>
      <main className="min-h-screen bg-white px-5 py-6">
        <h1 className="text-2xl font-extrabold text-center mt-2">Visibility subscription</h1>

        {current ? (
          <div className="mt-8 rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5 text-center">
            <div className="font-bold">
              Current plan: {TIERS.find(t => t.id === current.tier)?.label}
            </div>
            <div className="text-sm text-gray-700 mt-1">Renews {new Date(current.renewsAt).toLocaleDateString()}</div>
            <button onClick={cancel} className="mt-4 text-sm text-red-600 underline">Cancel subscription</button>
          </div>
        ) : (
          <>
            <div className="relative grid grid-cols-3 gap-1 bg-gray-100 rounded-2xl p-1 mt-6">
              {TIERS.map(t => (
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
                  <div aria-hidden="true" className="text-[10px] font-semibold text-gray-500 mt-1">{t.price}</div>
                </button>
              ))}
            </div>

            <div className="text-center mt-8">
              <div className="text-5xl font-black tracking-tight">
                {selected.priceBig}
                <span className="text-base font-bold text-gray-500">{selected.sub}</span>
              </div>
              <div className="text-xs text-gray-500 mt-2">{selected.perWeek}</div>
            </div>

            <ul className="mt-6 space-y-3">
              <Benefit>Appear in homeowner swipe feeds — AI-ranked by project match</Benefit>
              <Benefit>Free chat on match — no per-unlock fee when a homeowner picks you</Benefit>
              <Benefit>Cancel any time — stay visible until your period ends</Benefit>
            </ul>

            <div className="mt-8">
              <button
                onClick={subscribe}
                className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-lg shadow-indigo-600/30"
              >
                Continue with {selected.label} — {selected.priceBig}
              </button>
              <p className="text-[11px] text-gray-500 text-center mt-3">
                Cancel anytime. You'll stay visible until the end of your paid period.
              </p>
            </div>
          </>
        )}
      </main>
    </AuthedOnly>
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
