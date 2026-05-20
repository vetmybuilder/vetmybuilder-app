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
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { trackLeadSwiped, trackMatchFormed } from "@/utils/analytics";
import { useAuth } from "@/utils/auth";
import { useMobileMenu } from "@/utils/mobileMenu";
import { ChevronLeft } from "lucide-react";
import TradesmanOnly from "@/components/TradesmanOnly";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import IncomingLeadCard, {
  IncomingLead,
} from "@/components/project/IncomingLeadCard";
import SwipePayGate, {
  type SwipePayGateSubject,
} from "@/components/tradesmen/SwipePayGate";

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
  const [paygate, setPaygate] = useState<SwipePayGateSubject | null>(null);

  // Scroll-snap rail tracks which card is currently centred so the
  // "Reply to homeowner" CTA at the bottom acts on the right lead.
  const railRef = useRef<HTMLDivElement | null>(null);
  function onRailScroll() {
    const el = railRef.current;
    if (!el || leads.length === 0) return;
    const cardW = el.scrollWidth / leads.length;
    const next = Math.round(el.scrollLeft / cardW);
    if (next !== index && next >= 0 && next < leads.length) setIndex(next);
  }

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

  // Desktop V1 filter state - persists across responses but not pages.
  const [sourceFilter, setSourceFilter] = useState<"all" | "recommended" | "subscribed">("all");
  const [recencyFilter, setRecencyFilter] = useState<"all" | "24h" | "week">("all");

  const filteredLeads = leads.filter((lead) => {
    if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
    if (recencyFilter === "24h" && lead.pickedHoursAgo > 24) return false;
    if (recencyFilter === "week" && lead.pickedHoursAgo > 168) return false;
    return true;
  });

  async function respond(direction: "left" | "right") {
    if (!current || busy) return;
    // Gate ONLY the right-swipe (accept). Declining a lead gains the
    // trade nothing, so charging them to say "no thanks" is bad UX —
    // and risks them ignoring leads they don't want rather than
    // explicitly declining, which leaves the homeowner waiting.
    if (gated && direction === "right") {
      // Subscribed-tier lead but the builder isn't subscribed - open the
      // SwipePayGate so they can buy a pass or one-off unlock without
      // leaving the page. The current lead stays pinned in the carousel.
      setPaygate({
        projectId: Number(current.projectId),
        title: current.title,
        location: current.outward,
        type: current.trades[0] ?? null,
        priceBandLabel: null,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(
        `/api/swipe-interest/${current.matchId}/respond`,
        { direction },
      );
      trackLeadSwiped(direction, Number(current.projectId));
      if (direction === "right" && res.data?.status === "matched") {
        trackMatchFormed(
          Number(current.projectId),
          res.data?.builderUid || "self",
          current.source === "paid_unlock" ? "paid_unlock" : "subscribed",
        );
        // Pop the bottom-right TradesmanMessagingDock for the new
        // match instead of full-page-navigating to /chat — the
        // homeowner side uses the same dock pattern (see
        // InboxDropdown.openChatFromInbox), so both sides now land in
        // the same chat surface after a match forms.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("vmb:openDock"));
          window.dispatchEvent(
            new CustomEvent("vmb:openChat", {
              detail: { matchId: Number(current.matchId) },
            }),
          );
        }
      }
      // Drop the responded-to lead from the queue so the carousel
      // advances naturally. Reset index if we walked off the end.
      setLeads((prev) => {
        const next = prev.filter((l) => l.matchId !== current.matchId);
        return next;
      });
      setIndex((i) => Math.max(0, Math.min(i, leads.length - 2)));
    } finally {
      setBusy(false);
    }
  }

  // Desktop respond - operates on a specific lead (not the deck index)
  // since the desktop layout shows all leads simultaneously.
  async function respondToLead(lead: IncomingLead, direction: "left" | "right") {
    if (busy) return;
    // Only gate the right-swipe (accept). Left-swipe (decline) should
    // always be free — see respond() above for the rationale.
    const isGated = lead.source === "subscribed" && !subActive;
    if (isGated && direction === "right") {
      setPaygate({
        projectId: Number(lead.projectId),
        title: lead.title,
        location: lead.outward,
        type: lead.trades[0] ?? null,
        priceBandLabel: null,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(
        `/api/swipe-interest/${lead.matchId}/respond`,
        { direction },
      );
      trackLeadSwiped(direction, Number(lead.projectId));
      if (direction === "right" && res.data?.status === "matched") {
        trackMatchFormed(
          Number(lead.projectId),
          res.data?.builderUid || "self",
          lead.source === "paid_unlock" ? "paid_unlock" : "subscribed",
        );
        // Same dock-pop pattern as respond() above — matches the
        // homeowner-side post-match UX.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("vmb:openDock"));
          window.dispatchEvent(
            new CustomEvent("vmb:openChat", {
              detail: { matchId: Number(lead.matchId) },
            }),
          );
        }
      }
      // Remove the responded-to lead from the local list.
      setLeads((prev) => prev.filter((l) => l.matchId !== lead.matchId));
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

        {/* MOBILE - snap-carousel of leads. Cards inset with margin so
            ~30px of the next card peeks on the right edge, telling the
            builder there's more in the queue. Native CSS scroll-snap +
            iOS momentum; a scroll listener tracks the active card so
            the bottom CTA acts on the right one. */}
        <main
          className="md:hidden fixed inset-0 overflow-hidden no-scrollbar bg-[#dde7d2] flex flex-col"
          data-testid="tradesman-leads-deck"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          <div style={{ height: "env(safe-area-inset-top)" }} />

          {/* Top bar */}
          <div className="px-4 pt-2 pb-2 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center shadow-sm shrink-0"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[16px] font-extrabold tracking-tight text-gray-900 truncate">
                Incoming interest
              </span>
              {leads.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold shrink-0">
                  {leads.length} new
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label="Open menu"
              onClick={openMenu}
              className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center shadow-sm shrink-0"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <span className="text-[20px] leading-none text-gray-700">☰</span>
            </button>
          </div>

          {/* Position indicator */}
          {!loading && leads.length > 0 && (
            <div className="text-center text-[11px] font-extrabold tracking-[0.18em] uppercase text-emerald-900/60 pb-1 shrink-0">
              {leads.length === 1
                ? "1 new"
                : `Swipe to browse · ${index + 1} of ${leads.length}`}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[14px] font-semibold text-emerald-700 animate-pulse">
                Loading…
              </span>
            </div>
          )}

          {/* Empty state */}
          {!loading && leads.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <IncomingLeadsEmpty hasSub={subActive} />
            </div>
          )}

          {/* Snap-carousel rail. Each card sits in a 100%-40px wide slot
              with padding on the right so the next card's emerald hero
              peeks ~30px past the active card's edge. */}
          {!loading && leads.length > 0 && (
            <>
              <div
                ref={railRef}
                onScroll={onRailScroll}
                className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory"
                style={{
                  scrollPaddingLeft: 16,
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <div className="flex h-full pl-4">
                  {leads.map((lead) => (
                    <div
                      key={lead.matchId}
                      className="shrink-0 snap-start pr-3 pt-1 pb-3"
                      style={{
                        // Single lead: full-width card (minus symmetric
                        // gutters). Multiple leads: leave 40px so the next
                        // card's hero peeks past the active card's edge.
                        width:
                          leads.length === 1
                            ? "calc(100% - 16px)"
                            : "calc(100% - 40px)",
                      }}
                    >
                      <IncomingLeadCard lead={lead} />
                    </div>
                  ))}
                  {/* Tail spacer so the last card lands flush at the
                      same scroll-padding as the others. Skip when there's
                      only one card (no rail to scroll). */}
                  {leads.length > 1 && <div className="shrink-0 w-4" />}
                </div>
              </div>

              {/* Pass + Reply act on the centred card. Pass drops the
                  lead from the queue. Reply: subscribed builder -> direct
                  match -> /chat; unsubscribed -> open SwipePayGate, gate
                  finishes the flow into chat. */}
              <div className="px-4 pb-3 pt-1 shrink-0 flex items-center gap-2">
                <button
                  onClick={() => respond("left")}
                  disabled={busy || !current}
                  className="shrink-0 py-4 px-5 rounded-2xl text-slate-700 font-extrabold text-[15px] tracking-tight bg-white border border-slate-200 disabled:opacity-50"
                  data-testid="mobile-lead-pass"
                >
                  Pass
                </button>
                <button
                  onClick={() => respond("right")}
                  disabled={busy || !current}
                  className="flex-1 py-4 px-5 rounded-2xl text-white font-extrabold text-[15px] tracking-tight shadow-[0_10px_24px_rgba(16,185,129,0.3)] disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg,#10b981,#059669)",
                  }}
                  data-testid="mobile-lead-accept"
                >
                  Reply to homeowner →
                </button>
              </div>
            </>
          )}
        </main>

        {/* DESKTOP - V1 two-column layout: filter rail + lead rows with
            inline Pass / Accept buttons. Reuses the same fetch + respond
            handlers as the mobile deck. */}
        <div
          className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden"
          data-testid="tradesman-leads-desktop"
        >
          <SiteHeader />
          <BrandWatermarkScatter />

          <div className="mx-auto max-w-6xl px-6 pb-12 relative z-10">
            <div className="text-center pt-6 pb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
                Incoming interest
              </div>
              <h1
                className="text-[26px] font-black tracking-tight text-slate-900 leading-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Homeowners{" "}
                <span
                  className="text-emerald-600"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                >
                  picked you
                </span>
              </h1>
            </div>

            <div className="grid md:grid-cols-[280px_1fr] gap-6">
              {/* LEFT RAIL */}
              <aside>
                <div className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm sticky top-6">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-1.5">
                    Filter
                  </div>
                  <h2
                    className="text-[17px] font-black text-slate-900 leading-tight mb-3"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Decide what to pitch
                  </h2>

                  <FilterGroup label="Source">
                    <FilterPill
                      label="All"
                      active={sourceFilter === "all"}
                      onClick={() => setSourceFilter("all")}
                    />
                    <FilterPill
                      label="Recommended"
                      active={sourceFilter === "recommended"}
                      onClick={() => setSourceFilter("recommended")}
                    />
                    <FilterPill
                      label="Subscribed"
                      active={sourceFilter === "subscribed"}
                      onClick={() => setSourceFilter("subscribed")}
                    />
                  </FilterGroup>

                  <FilterGroup label="When">
                    <FilterPill
                      label="All"
                      active={recencyFilter === "all"}
                      onClick={() => setRecencyFilter("all")}
                    />
                    <FilterPill
                      label="Last 24h"
                      active={recencyFilter === "24h"}
                      onClick={() => setRecencyFilter("24h")}
                    />
                    <FilterPill
                      label="This week"
                      active={recencyFilter === "week"}
                      onClick={() => setRecencyFilter("week")}
                    />
                  </FilterGroup>

                  <button
                    type="button"
                    onClick={() => {
                      setSourceFilter("all");
                      setRecencyFilter("all");
                    }}
                    className="mt-4 w-full text-[12px] font-bold text-emerald-700 underline"
                  >
                    Clear all
                  </button>
                </div>
              </aside>

              {/* MAIN COLUMN */}
              <main>
                <div className="text-[12px] font-bold text-slate-500 mb-3 px-1">
                  {filteredLeads.length} pending - leads expire after 14 days
                </div>

                {loading && (
                  <div className="bg-white border border-amber-100 rounded-2xl shadow-sm flex items-center justify-center py-16">
                    <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                      Loading…
                    </span>
                  </div>
                )}

                {!loading && filteredLeads.length === 0 && (
                  <div className="bg-white border border-amber-100 rounded-3xl shadow-sm px-6 py-10 text-center">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                      style={{
                        background: "linear-gradient(135deg, #6ee7b7, #10b981)",
                      }}
                    >
                      <span className="text-[32px] leading-none">🔨</span>
                    </div>
                    <h3
                      className="text-[18px] font-extrabold text-slate-900"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      {leads.length === 0
                        ? "No-one's picked you yet"
                        : "No leads match those filters"}
                    </h3>
                    <p className="mt-2 text-[13px] text-slate-500 max-w-[340px] mx-auto leading-relaxed">
                      {leads.length === 0
                        ? subActive
                          ? "When a homeowner picks you, their job lands here for you to accept or pass on."
                          : "When a homeowner picks you, their job lands here. Keep your subscription active to stay visible."
                        : "Try clearing the source or recency filters."}
                    </p>
                    {leads.length === 0 && (
                      <Link
                        href="/tradesman/jobs"
                        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-[13px] font-extrabold"
                      >
                        Discover new jobs →
                      </Link>
                    )}
                  </div>
                )}

                {!loading && filteredLeads.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {filteredLeads.map((lead) => (
                      <DesktopLeadRow
                        key={lead.matchId}
                        lead={lead}
                        gated={lead.source === "subscribed" && !subActive}
                        busy={busy}
                        onPass={() => respondToLead(lead, "left")}
                        onAccept={() => respondToLead(lead, "right")}
                      />
                    ))}
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>

        {/* Pitch-this-job paygate. Same modal that opens when a builder
            right-swipes a paywalled job in /tradesman/jobs - surfaced
            here so the lead-side "Subscribe to respond" CTA opens the
            canonical billing flow instead of the deprecated
            /tradesman/billing visibility-pass page. */}
        <SwipePayGate
          open={paygate !== null}
          subject={paygate}
          onClose={() => setPaygate(null)}
        />
      </>
    </TradesmanOnly>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold border transition-colors ${
        active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
      }`}
    >
      {label}
    </button>
  );
}

function DesktopLeadRow({
  lead,
  gated,
  busy,
  onPass,
  onAccept,
}: {
  lead: IncomingLead;
  gated: boolean;
  busy: boolean;
  onPass: () => void;
  onAccept: () => void;
}) {
  const isRecommended = lead.source === "recommended";
  const sourceClass = isRecommended
    ? "bg-emerald-50 text-emerald-700"
    : "bg-indigo-50 text-indigo-700";

  return (
    <article
      className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all"
      data-testid={`desktop-lead-row-${lead.matchId}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 text-xl">
          🤝
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${sourceClass}`}
            >
              {isRecommended ? "Recommended" : "Subscribed"}
            </span>
            {isRecommended && lead.recommenderName && (
              <span className="text-[10.5px] text-slate-500">
                via {lead.recommenderName}
              </span>
            )}
            <span className="ml-auto text-[10.5px] font-bold text-slate-400">
              {lead.pickedHoursAgo}h ago
            </span>
          </div>
          <h3
            className="mt-1 text-[14.5px] font-black text-slate-900 leading-snug"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {lead.title}
          </h3>
          <div className="mt-1 text-[11.5px] text-slate-500">
            📍 {lead.outward || "Area not shared"}
          </div>
          {lead.description && (
            <p className="mt-2 text-[12.5px] text-slate-600 leading-relaxed line-clamp-2">
              {lead.description}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1.5">
              {lead.budget && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-extrabold">
                  {lead.budget}
                </span>
              )}
              {lead.trades.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10.5px] font-bold capitalize"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPass}
                disabled={busy}
                className="px-3 py-1.5 rounded-full text-[11.5px] font-extrabold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                data-testid={`desktop-lead-pass-${lead.matchId}`}
              >
                Pass
              </button>
              <button
                type="button"
                onClick={onAccept}
                disabled={busy}
                className="px-3 py-1.5 rounded-full text-[11.5px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                data-testid={`desktop-lead-accept-${lead.matchId}`}
              >
                Reply to homeowner →
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
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
