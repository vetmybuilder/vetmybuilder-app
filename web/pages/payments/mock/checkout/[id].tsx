import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

/** Server returns items like { label, price: { amount, currency }, quantity } */
type LineItem = {
  label: string;
  price: { amount: number; currency: string };
  quantity: number;
};

type Session = {
  id: string;
  status: "open" | "paid" | "canceled" | "expired";
  items?: LineItem[];
  userId?: string;
  createdAt?: number;
  success_url?: string;
  cancel_url?: string;
};

function money(amountMinor: number, currency = "GBP") {
  try {
    const v = (amountMinor ?? 0) / 100;
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `£${((amountMinor ?? 0) / 100).toFixed(2)}`;
  }
}

function totalFromItems(items?: LineItem[]) {
  if (!items || !items.length) return { total: 0, currency: "GBP" };
  let currency = items[0].price?.currency || "GBP";
  const total = items.reduce((sum, it) => {
    const q = Number.isFinite(it.quantity) ? it.quantity : 1;
    const amt = Number.isFinite(it.price?.amount) ? it.price.amount : 0;
    return sum + q * amt;
  }, 0);
  return { total, currency };
}

export default function MockCheckout() {
  const router = useRouter();
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  // Accept either /.../[id]? or ?session_id=...
  const id = useMemo(() => {
    const q = router.query;
    const fromPath = String(q.id ?? "");
    const fromQuery = String(q.session_id ?? "");
    return (fromPath || fromQuery) as string;
  }, [router.query]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // ---- Fetch session (mock) -------------------------------------------------
  async function fetchSessionDual(sessionId: string) {
    // 1) New: /api/payments/checkout/session?sessionId=...
    try {
      const { data } = await api.get("/api/payments/checkout/session", {
        params: { sessionId },
      });
      return data?.session || data || null;
    } catch (e: any) {
      const code = e?.response?.status;
      if (code !== 404) throw e;
    }
    // 2) Legacy: /api/payments/checkout/:id
    const { data } = await api.get(
      `/api/payments/checkout/${encodeURIComponent(sessionId)}`
    );
    return data?.session || data || null;
  }

  // Load only when authed so bearer token is present
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let dead = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const s = await fetchSessionDual(id);
        if (!dead) setSession(s);
      } catch (e: any) {
        if (!dead) {
          const status = e?.response?.status;
          const msg =
            status === 401
              ? "Missing bearer token"
              : status === 404
              ? "Not found"
              : e?.response?.data?.error ||
                e?.message ||
                "Unable to load session";
          setErr(msg);
        }
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [api, router.isReady, authLoading, user, id]);

  // ---- Actions (mock) -------------------------------------------------------
  async function onCancel() {
    if (!session || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      // POST /api/payments/mock/cancel { sessionId }
      await api.post("/api/payments/mock/cancel", { sessionId: session.id });
      // best-effort cleanup
      try { sessionStorage.removeItem("vmb.lastPaidSessionId"); } catch {}
      await router.replace(session.cancel_url || "/");
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to cancel");
      setSubmitting(false);
    }
  }

  async function onPay() {
    if (!session || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      // POST /api/payments/mock/pay { sessionId, card }
      const { data } = await api.post("/api/payments/mock/pay", {
        sessionId: session.id,
        // purely illustrative; server ignores specifics in mock mode
        card: { number: "4242 4242 4242 4242", expMonth: 12, expYear: 2030, cvc: "123" },
      });
      const updated: Session = data?.session || session;
      setSession(updated);

      // NEW: stash real session id to survive placeholder querystrings
      try {
        if (updated?.id) sessionStorage.setItem("vmb.lastPaidSessionId", updated.id);
      } catch {}

      await router.replace(
        updated.success_url ||
          `/payments/mock/success?session_id=${encodeURIComponent(updated.id)}`
      );
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Payment failed");
      setSubmitting(false);
    }
  }

  const { total, currency } = totalFromItems(session?.items);
  const totalHuman = money(total, currency);
  const needsLogin = !authLoading && !user;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold text-slate-900">
            VetMyBuilder
          </Link>
          <div className="text-sm text-slate-500">Mock Payment</div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {authLoading || loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            Loading checkout…
          </div>
        ) : needsLogin ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <p className="font-medium text-rose-800">You need to sign in</p>
            <p className="mt-1 text-sm text-rose-700">
              Please sign in to continue to checkout.
            </p>
            <div className="mt-4">
              <Link
                href="/"
                className="text-sm font-medium text-slate-700 underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        ) : err ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <p className="font-medium text-rose-800">Unable to load checkout</p>
            <p className="mt-1 text-sm text-rose-700">{err}</p>
            <div className="mt-4">
              <Link
                href="/"
                className="text-sm font-medium text-slate-700 underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        ) : !session ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <p className="font-medium text-rose-800">Session not found</p>
            <div className="mt-4">
              <Link
                href="/"
                className="text-sm font-medium text-slate-700 underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <h1 className="text-2xl font-semibold">Checkout</h1>
                <div className="text-right">
                  <div className="text-xl font-semibold">{totalHuman}</div>
                  <div className="text-sm text-slate-500">{totalHuman}</div>
                </div>
              </div>

              {Array.isArray(session.items) && session.items.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {session.items.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    >
                      <div>
                        <div className="font-medium">{it.label}</div>
                        <div className="text-slate-500">
                          Qty {it.quantity || 1}
                        </div>
                      </div>
                      <div className="font-medium">
                        {money(
                          it.price.amount * (it.quantity || 1),
                          it.price.currency
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Test Card
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  4242 4242 4242 4242
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  12 / 2030 · CVC 123
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={onCancel}
                  disabled={submitting}
                  className="h-10 rounded-full border border-slate-300 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={onPay}
                  disabled={submitting}
                  data-testid="btn-mock-pay"
                  className={`h-10 inline-flex items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition ${submitting ? "bg-zinc-400" : "bg-slate-900 hover:bg-slate-900/90 active:scale-95 disabled:opacity-60"}`}
                >
                  {submitting && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
                  {submitting ? "Processing…" : "Pay now"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}