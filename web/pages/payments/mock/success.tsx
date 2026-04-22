import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [info, setInfo] = useState<string>("");

  // prevent double-finalise on Fast Refresh / re-renders
  const finalisedRef = useRef(false);

  // Try both endpoints to read the session (legacy alias + canonical)
  async function loadSessionDual(id: string): Promise<Session | null> {
    try {
      const { data } = await api.get("/api/payments/checkout/session", {
        params: { sessionId: id },
      });
      return (data?.session || data || null) as Session | null;
    } catch (e: any) {
      if ((e?.response?.status ?? 0) !== 404) throw e;
    }
    const { data } = await api.get(
      `/api/payments/checkout/${encodeURIComponent(id)}`
    );
    return (data?.session || data || null) as Session | null;
  }

  // Helper: detect spotlight one-off from session
  function isSpotlightOneOff(s: Session): boolean {
    const md = (s?.metadata || {}) as Record<string, unknown>;
    const planId = String((md as any).planId || (md as any).plan_id || "")
      .toLowerCase()
      .trim();
    const label0 = String(s?.items?.[0]?.label || "");
    const hasDuration = (md as any).durationDays != null;
    return (
      planId === "spotlight" ||
      /one[-\s]?off/i.test(label0) ||
      !!hasDuration
    );
  }

  // Finalise spotlight: (1) mark mock session paid, (2) create payments_oneoff row
  async function finaliseSpotlight(s: Session) {
    if (finalisedRef.current) return;
    finalisedRef.current = true;
    try {
      setInfo("Marking session paid…");

      // 1) mark mock session PAID (uses axios client that injects auth/bearer)
      await api.post("/api/payments/mock/pay", { sessionId: s.id });

      // 2) record payments_oneoff (pending) via dedicated route
      const totalMinor =
        s?.total?.amount ??
        (Array.isArray(s?.items)
          ? s.items!.reduce(
              (sum, it) =>
                sum +
                Number(it?.price?.amount || 0) * Number(it?.quantity || 1),
              0
            )
          : 0);
      const currency =
        s?.total?.currency ??
        ((Array.isArray(s?.items) && s.items![0]?.price?.currency) || "GBP");

      setInfo("Recording one-off payment…");

      await api.post("/api/payments/oneoff/spotlight/purchase", {
        provider_session_id: s.id,
        amount: totalMinor || 0,
        currency: String(currency || "GBP").toUpperCase(),
      });

      setInfo("Spotlight purchase recorded.");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to finalise spotlight";
      setErr(`mock/pay ${msg}`);
    }
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
      setInfo("");

      try {
        const s = await loadSessionDual(rawId);
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

        // ---------- NEW: redirect for one-off unlocks ----------
        const md = (s.metadata || {}) as Record<string, unknown>;
        const typ = String(
          md.type || md.kind || md.vmb_type || ""
        ).toLowerCase();
        const projectId = Number(
          md.projectId || md.project_id || md.vmb_project_id
        );

        if (typ === "unlock_contact") {
          // After a one-off contact unlock, always send tradesman
          // back to their projects list, optionally tagging the project.
          let target = "/tradesman/projects?unlock=success";
          if (Number.isFinite(projectId) && projectId > 0) {
            target += `&open=${projectId}`;
          }
          router.replace(target);
          return;
        }
        // -------------------------------------------------------

        // If this was a spotlight one-off, ensure we write payments_oneoff now
        if (isSpotlightOneOff(s)) {
          await finaliseSpotlight(s);
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
            {info && <p className="mt-2 text-sm text-slate-500">{info}</p>}
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

          {!!info && (
            <p
              className="mt-2 text-sm text-slate-500"
              data-testid="success-info"
            >
              {info}
            </p>
          )}

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
