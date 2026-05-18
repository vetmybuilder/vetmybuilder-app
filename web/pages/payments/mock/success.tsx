import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";

type LineItem = {
  label: string;
  price: { amount: number; currency: string };
  quantity: number;
};
type Session = {
  id: string;
  status: "open" | "paid" | "canceled" | "expired";
  items?: LineItem[];
  total?: { amount: number; currency: string };
  metadata?: Record<string, unknown>;
};

function money(minor: number, currency = "GBP") {
  const v = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `£${v.toFixed(2)}`;
  }
}

export default function MockSuccess() {
  const router = useRouter();
  const api = useApi();

  // Extract a clean session id from multiple possible query keys, with fallback to sessionStorage
  const rawId = useMemo(() => {
    const pick = (v: unknown) =>
      Array.isArray(v) ? (v[0] as string) : (v as string | undefined);

    let s =
      pick(router.query.session_id) ||
      pick(router.query.sessionId) ||
      pick(router.query.id) ||
      undefined;

    if (!s && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      s =
        sp.get("session_id") ||
        sp.get("sessionId") ||
        sp.get("id") ||
        undefined;
    }

    if (s) {
      s = decodeURIComponent(s).trim().replace(/[{}]/g, "");
      if (s.includes("?")) s = s.split("?")[0];
      if (s.includes("#")) s = s.split("#")[0];
    }

    // Fallback if some flow left literal "SESSION_ID"
    if (!s || s.toUpperCase() === "SESSION_ID") {
      try {
        const cached = sessionStorage.getItem("vmb.lastPaidSessionId");
        if (cached) s = cached;
      } catch {}
    }

    return s || "";
  }, [router.query]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // Read the session from the mock session store
  async function loadSession(id: string): Promise<Session | null> {
    const { data } = await api.get("/api/payments/mock/session", {
      params: { sessionId: id },
    });
    return (data?.session || data || null) as Session | null;
  }

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!rawId) {
        setErr("Missing session id");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);

      try {
        const s = await loadSession(rawId);
        if (dead) return;
        if (!s) {
          setErr("Not found");
          setLoading(false);
          return;
        }
        setSession(s);

        // clear the stash once we have it
        try {
          sessionStorage.removeItem("vmb.lastPaidSessionId");
        } catch {}

        // redirect for one-off unlocks
        const md = (s.metadata || {}) as Record<string, unknown>;
        const typ = String(
          md.type || md.kind || md.vmb_type || ""
        ).toLowerCase();

        if (typ === "unlock_contact") {
          // Boost-slot model: payment creates a 'pending' swipe_interest
          // row, NOT a 'matched' one. There's no chat yet - the homeowner
          // still has to right-swipe to form the match. Route to the
          // confirmation page so the trade understands what happens next.
          router.replace("/tradesman/unlock/sent");
          return;
        }
      } catch (e: any) {
        setErr(
          e?.response?.data?.error || e?.message || "Unable to load session"
        );
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [api, rawId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            Loading payment…
          </div>
        </main>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <p className="font-medium text-rose-800">We hit a snag</p>
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
        </main>
      </div>
    );
  }

  const totalMinor =
    session?.total?.amount ??
    (Array.isArray(session?.items)
      ? session!.items!.reduce(
          (sum, it) =>
            sum + (it.price?.amount || 0) * (it.quantity || 1),
          0
        )
      : 0);
  const currency =
    session?.total?.currency ??
    ((Array.isArray(session?.items) &&
      session!.items![0]?.price?.currency) ||
      "GBP");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Payment successful</h1>
          <p className="mt-1 text-slate-600">
            Session <span className="font-mono">{session?.id}</span>
          </p>

          <div className="mt-4">
            <div className="text-xl font-semibold">
              {money(totalMinor, currency)}
            </div>
          </div>

          {Array.isArray(session?.items) && session!.items!.length > 0 && (
            <ul className="mt-4 space-y-2">
              {session!.items!.map((it, i) => (
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
                      (it.price.amount || 0) * (it.quantity || 1),
                      it.price.currency
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <Link
              href="/"
              className="text-sm font-medium text-slate-700 underline"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold text-slate-900">
          VetMyBuilder
        </Link>
        <div className="text-sm text-slate-500">Payment Result</div>
      </div>
    </div>
  );
}
