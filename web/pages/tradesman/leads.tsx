// web/pages/tradesman/leads.tsx
//
// Mobile-first incoming-interest deck for tradesmen - homeowner-initiated
// picks the builder hasn't responded to yet. Same visual shell as
// /tradesman/jobs (the discovery deck): bare layout, emerald gradient,
// top bar, action bar at the bottom. Renders IncomingLeadCard since the
// data shape differs from JobCardData (matchId vs projectId, source tier,
// recommenderName etc.).
//
// Note: this used to live at /tradesman/matches, but that path now hosts
// the formed-matched-pairs list (the builder analogue of homeowner
// /matches). This deck remains the place where a builder responds to
// incoming-interest swipes.

import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useMobileMenu } from "@/utils/mobileMenu";
import TradesmanOnly from "@/components/TradesmanOnly";
import IncomingLeadCard, {
  IncomingLead,
} from "@/components/project/IncomingLeadCard";
import IncomingLeadCardBack from "@/components/project/IncomingLeadCardBack";
import SwipeActionBar from "@/components/project/SwipeActionBar";

export default function TradesmanLeadsPage() {
  const api = useApi();
  const router = useRouter();
  const { openMenu } = useMobileMenu();
  const { user, loading: authLoading } = useAuth();

  const [leads, setLeads] = useState<IncomingLead[]>([]);
  const [subActive, setSubActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [index]);

  useEffect(() => {
    // Wait for Firebase to restore the session on hard reload. Without
    // this gate the api interceptor sends the request without an auth
    // header, the server 401s, and the .catch below would fire too late
    // to suppress the original unhandled-rejection in dev.
    if (authLoading) return;
    if (!user) return;

    let cancelled = false;
    setLoading(true);
    api
      .get("/api/tradesman/incoming-interest")
      .then((r) => {
        if (cancelled) return;
        setLeads(r.data?.leads || []);
        setSubActive(Boolean(r.data?.subscriptionActive));
      })
      .catch(() => {
        if (cancelled) return;
        setLeads([]);
        setSubActive(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const current = leads[index];
  const remaining = Math.max(0, leads.length - index);
  const gated = current?.source === "subscribed" && !subActive;

  async function respond(direction: "left" | "right") {
    if (!current || busy) return;
    if (gated) {
      router.push("/tradesman/billing");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/api/swipe/respond", {
        matchId: current.matchId,
        direction,
      });
      if (direction === "right" && res.data?.status === "matched") {
        router.push(`/match/${current.matchId}`);
        return;
      }
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TradesmanOnly>
      <>
        <Head>
          <title>Incoming interest - VetMyBuilder</title>
        </Head>

        <main
          className="fixed inset-0 overflow-y-auto"
          data-testid="tradesman-leads-deck"
          style={{
            background:
              "linear-gradient(160deg, #ecfdf5 0%, #d1fae5 40%, #f0fdf4 100%)",
            paddingBottom: "env(safe-area-inset-bottom)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          <div style={{ height: "env(safe-area-inset-top)" }} />

          {/* Top bar */}
          <div className="px-4 pt-2 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-extrabold tracking-tight text-gray-900">
                Incoming interest
              </span>
              {remaining > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold">
                  {remaining} new
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label="Open menu"
              onClick={openMenu}
              className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <span className="text-[20px] leading-none text-gray-700">☰</span>
            </button>
          </div>

          {/* Card N of M hint */}
          {!loading && leads.length > 0 && current && (
            <div className="text-center text-[12px] font-semibold text-emerald-700 mb-1">
              Card {index + 1} of {leads.length}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center pt-24">
              <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                Loading…
              </span>
            </div>
          )}

          {/* Empty state */}
          {!loading && !current && (
            <IncomingLeadsEmpty hasSub={subActive} />
          )}

          {/* Card */}
          {!loading && current && (
            <div className="px-4 mt-2">
              <div style={{ perspective: "1200px" }}>
                <div
                  className="relative"
                  style={{
                    transformStyle: "preserve-3d",
                    transition:
                      "transform 0.55s cubic-bezier(0.4, 0.0, 0.2, 1)",
                    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                    minHeight: 360,
                  }}
                >
                  <div
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                    }}
                  >
                    <IncomingLeadCard lead={current} />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <IncomingLeadCardBack
                      lead={current}
                      onViewFull={() =>
                        router.push(`/projects/${current.projectId}`)
                      }
                    />
                  </div>
                </div>
              </div>

              {gated ? (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 text-center">
                  Subscribe to respond to this lead.
                  <button
                    onClick={() => router.push("/tradesman/billing")}
                    className="mt-2 block mx-auto py-2 px-4 bg-emerald-600 text-white rounded-lg font-bold"
                  >
                    Go to billing
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <SwipeActionBar
                    disabled={busy}
                    onPass={() => respond("left")}
                    onInfo={() => setFlipped((v) => !v)}
                    onLike={() => respond("right")}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </>
    </TradesmanOnly>
  );
}

// ---- Empty state ----

const CONFETTI: Array<{ left: string; top: string; bg: string; rot: number }> =
  [
    { left: "12%", top: "14%", bg: "#34d399", rot: 15 },
    { left: "78%", top: "12%", bg: "#10b981", rot: -25 },
    { left: "25%", top: "24%", bg: "#6ee7b7", rot: 45 },
    { left: "65%", top: "30%", bg: "#059669", rot: 20 },
    { left: "50%", top: "18%", bg: "#a7f3d0", rot: -15 },
    { left: "18%", top: "78%", bg: "#34d399", rot: 30 },
    { left: "80%", top: "72%", bg: "#10b981", rot: -10 },
    { left: "35%", top: "84%", bg: "#6ee7b7", rot: 50 },
    { left: "55%", top: "80%", bg: "#059669", rot: -30 },
  ];

function IncomingLeadsEmpty({ hasSub }: { hasSub: boolean }) {
  return (
    <div className="relative min-h-[520px] flex flex-col items-center justify-center px-7 py-10 text-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="absolute opacity-70"
            style={{
              left: c.left,
              top: c.top,
              background: c.bg,
              width: 7,
              height: 7,
              borderRadius: 2,
              transform: `rotate(${c.rot}deg)`,
            }}
          />
        ))}
      </div>

      <div
        className="relative w-24 h-24 rounded-full flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg, #6ee7b7, #10b981)",
          boxShadow: "0 12px 36px rgba(16,185,129,0.25)",
        }}
      >
        <span className="text-[44px] leading-none">
          🔨
        </span>
      </div>

      <h2 className="relative text-[26px] font-extrabold tracking-[-0.02em] leading-[1.2] text-gray-900">
        No-one&apos;s picked you yet
      </h2>
      <p className="relative mt-2.5 text-[14px] text-gray-500 leading-[1.5] max-w-[290px]">
        {hasSub
          ? "When a homeowner picks you, their job lands here for you to swipe on. We'll send you a push notification."
          : "When a homeowner picks you, their job lands here. Keep your subscription active to stay visible."}
      </p>

      <div className="relative mt-7 w-full max-w-[320px]">
        <Link
          href="/tradesman/jobs"
          className="flex items-center justify-center gap-2 py-4 px-5 rounded-2xl text-white font-extrabold text-[15px] tracking-tight shadow-[0_10px_24px_rgba(16,185,129,0.3)]"
          style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
        >
          Discover new jobs &rarr;
        </Link>
      </div>
    </div>
  );
}
