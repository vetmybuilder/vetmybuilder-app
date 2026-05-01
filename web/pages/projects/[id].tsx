// pages/projects/[id].tsx
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import BrandWordmark from "@/components/BrandWordmark";
import { useProjectView } from "@/components/project/views/useProjectView";
import OwnerProjectView from "@/components/project/views/OwnerProjectView";
import TradesmanProjectView from "@/components/project/views/TradesmanProjectView";
import NeighbourProjectView from "@/components/project/views/NeighbourProjectView";
import Layout from "@/components/Layout";
import SwipeDeck from "@/components/project/SwipeDeck";
import ProjectActionsSheet from "@/components/project/ProjectActionsSheet";
import ShareProjectModal from "@/components/project/ShareProjectModal";
import PhotoLightbox from "@/components/PhotoLightbox";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useSseEvent } from "@/utils/useSseEvent";

type ViewerRole = "unknown" | "owner" | "trades" | "home";

function getShortProjectTitle(name?: string | null): string {
  if (!name) return "";
  let base = name.trim();
  if (base.toLowerCase().endsWith(" job post"))
    base = base.slice(0, -" job post".length).trim();
  const inIdx = base.toLowerCase().indexOf(" in ");
  if (inIdx > 0) base = base.slice(0, inIdx).trim();
  return base;
}

/* =====================================================================
 * Desktop swipe-deck view (homeowner picking from their shortlist)
 * --------------------------------------------------------------------
 * Option C - Side-rail layout. Two-column grid:
 *   - Left rail: project summary card + persistent share card
 *   - Main canvas: "Pick your tradesperson" headline + SwipeDeck or
 *     empty state. Same layout filled or empty so the homeowner always
 *     knows where they are and how to grow the list.
 * ===================================================================== */
function postedAgo(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function ProjectSwipeDesktop({
  projectId,
  projectTitle,
  project,
}: {
  projectId: string;
  projectTitle: string;
  project: {
    id: number | string;
    name?: string | null;
    location?: string | null;
    type?: string | null;
    createdAt?: string | null;
  };
}) {
  const api = useApi();
  const router = useRouter();
  const [matches, setMatches] = useState<{
    recommended: any[];
    paidUnlock?: any[];
    subscribed: any[];
    recommendationCards?: any[];
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paidUnlockToast, setPaidUnlockToast] = useState<string | null>(null);
  const [matchCelebration, setMatchCelebration] = useState<string | null>(null);

  const refreshMatches = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get(`/api/projects/${projectId}/matches`);
      setMatches(data);
    } catch {
      /* noop */
    }
  }, [projectId, api]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}/matches`);
        if (alive) setMatches(data);
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [projectId, api]);

  // ?openChat=<matchId> hand-off from the global header inbox. When the
  // user clicks a thread that belongs to this project (and they weren't
  // already on this page), the inbox dropdown navigates here with that
  // query param. We dispatch the dock's open event and strip the param
  // so it doesn't re-fire on a refresh. Small timeout so the dock has a
  // chance to mount and bind its event listener.
  useEffect(() => {
    const raw = router.query?.openChat;
    const v = Array.isArray(raw) ? raw[0] : raw;
    const matchId = Number(v);
    if (!Number.isFinite(matchId) || matchId <= 0) return;

    const t = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("vmb:openChat", { detail: { matchId } }),
      );
    }, 100);

    const { openChat: _drop, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true },
    );

    return () => clearTimeout(t);
    // Intentionally only watching openChat - the rest of router.query
    // changes shouldn't re-trigger this hand-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query?.openChat]);


  // Real-time deck update: a tradesperson just paid the per-project
  // unlock fee for this job. Refetch matches so the new card flows
  // into the deck via SwipeDeck's queue-splice logic, then surface a
  // toast so the homeowner notices something arrived.
  useSseEvent<{ type: string; projectId?: number; builderUid?: string }>(
    "deck_card_added",
    (data) => {
      if (!data || String(data.projectId) !== String(projectId)) return;
      refreshMatches();
      setPaidUnlockToast("A tradesperson just paid to pitch on this job");
      setTimeout(() => setPaidUnlockToast(null), 4500);
    },
  );

  const builders = useMemo(() => {
    if (!matches) return [] as any[];
    // Merge order: recommendation cards (off-platform) -> recommended ->
    // paid_unlock (most recent payer first) -> subscribed (smart-ranked).
    return [
      ...((matches.recommendationCards || []).map((rc: any) => ({
        uid: `rec-${rc.recommendationId}`,
        displayName: rc.company,
        companyName: rc.company,
        photoUrl: rc.coverPhotoUrl,
        tier: "recommended" as const,
        chVerified: false,
        starRating: null,
        reviewCount: 0,
        yearsTrading: 0,
        primaryTrade: null,
        secondaryTrades: [],
        serviceAreas: [],
        priceBand: null,
        baseScore: 0,
        whyMatch: `Recommended by ${rc.recommenderName}`,
        recommenderName: rc.recommenderName,
        isRecommendation: true,
        recommendationId: rc.recommendationId,
        coverPhotoUrl: rc.coverPhotoUrl,
      }))),
      ...(matches.recommended || []),
      ...(matches.paidUnlock || []),
      ...(matches.subscribed || []),
    ];
  }, [matches]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/projects/${projectId}/recommend`
      : "";
  const projectLabel = project?.name ? `my "${project.name}" project` : "my project";
  const messageBody = `Hey - I'm looking for a tradesperson for ${projectLabel}. If you know someone you'd recommend, please add them via VetMyBuilder: ${shareUrl}`;

  function viaWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(messageBody)}`, "_blank");
  }
  function viaEmail() {
    const subject = project?.name
      ? `Recommendation for ${project.name}`
      : "Recommendation request";
    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(messageBody)}`;
  }
  function viaSms() {
    window.location.href = `sms:?body=${encodeURIComponent(messageBody)}`;
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }

  const posted = postedAgo(project?.createdAt);

  return (
    <>
      <Head>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>
      <Layout>
        <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-6 relative overflow-hidden">
          <BrandWatermarkScatter />
          <div className="mx-auto max-w-6xl px-6 pt-3 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <a
                href="/projects"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>My jobs</span>
              </a>
              <div className="text-center">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-0.5">
                  Your shortlist
                </div>
                <h1
                  className="text-[22px] font-black tracking-tight text-slate-900 leading-tight"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  Pick your{" "}
                  <span
                    className="text-indigo-600"
                    style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                  >
                    tradesperson
                  </span>
                </h1>
              </div>
              {/* Spacer to balance the back-link so headline stays centred */}
              <div className="w-[80px]" aria-hidden />
            </div>

            <div className="grid md:grid-cols-[280px_1fr] gap-6">
              {/* LEFT RAIL */}
              <aside className="space-y-4">
                {/* Project summary card */}
                <div className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-1.5">
                    Live job
                  </div>
                  <h2
                    className="text-[19px] font-black tracking-tight leading-tight text-slate-900"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    {project?.name || projectTitle || "Project"}
                  </h2>
                  <div className="mt-3 space-y-2 text-[13px] text-slate-600">
                    {project?.location && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{"\u{1F4CD}"}</span>
                        <span className="truncate">{project.location}</span>
                      </div>
                    )}
                    {project?.type && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{"\u{1F527}"}</span>
                        <span className="truncate capitalize">{project.type}</span>
                      </div>
                    )}
                    {posted && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{"\u{1F551}"}</span>
                        <span>Posted {posted}</span>
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/projects/${projectId}/edit`}
                    className="mt-4 block w-full text-center rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-bold py-2 hover:bg-amber-100 transition-colors"
                  >
                    Edit job details
                  </Link>
                </div>

                {/* Share card */}
                <div className="bg-white border-2 border-indigo-400 rounded-3xl p-5 shadow-md relative">
                  <span className="absolute -top-2.5 left-5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white bg-indigo-600 px-2 py-0.5 rounded-full">
                    Grow your shortlist
                  </span>
                  <h3
                    className="text-[16px] font-black tracking-tight text-slate-900"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Invite your{" "}
                    <span
                      className="text-indigo-600"
                      style={{ fontFamily: "'Caveat', cursive", fontSize: "115%" }}
                    >
                      community
                    </span>
                  </h3>
                  <p className="mt-1 text-[12.5px] text-slate-600 leading-relaxed">
                    Friends and neighbours can recommend a tradesperson they trust.
                  </p>
                  {/* Three icon buttons (WhatsApp / Email / SMS), then a
                      full-width Copy share link button below. The legacy
                      "Share job" sheet trigger is removed on desktop -
                      these direct channels cover the same intent without
                      a second click. */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={viaWhatsApp}
                      aria-label="Share via WhatsApp"
                      className="aspect-square rounded-2xl border border-amber-100 bg-white flex flex-col items-center justify-center gap-1 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                    >
                      <span
                        className="w-9 h-9 rounded-full text-white flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982 1.0-3.648-.235-.374A9.86 9.86 0 0 1 2.15 11.892c.002-5.45 4.436-9.884 9.9-9.884 2.643 0 5.127 1.03 6.994 2.901a9.825 9.825 0 0 1 2.893 6.992c-.003 5.45-4.437 9.884-9.886 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.463 3.488z" />
                        </svg>
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-700">WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={viaEmail}
                      aria-label="Share via email"
                      className="aspect-square rounded-2xl border border-amber-100 bg-white flex flex-col items-center justify-center gap-1 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                    >
                      <span
                        className="w-9 h-9 rounded-full text-white flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <polyline points="3 7 12 13 21 7" />
                        </svg>
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-700">Email</span>
                    </button>

                    <button
                      type="button"
                      onClick={viaSms}
                      aria-label="Share via SMS"
                      className="aspect-square rounded-2xl border border-amber-100 bg-white flex flex-col items-center justify-center gap-1 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                    >
                      <span
                        className="w-9 h-9 rounded-full text-white flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg,#fbbf24,#d97706)" }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-700">SMS</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={copyLink}
                    className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-[12.5px] font-bold hover:bg-amber-100 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {copied ? "Link copied" : "Copy share link"}
                  </button>
                </div>

                <div className="text-[11.5px] text-slate-500 leading-relaxed px-1">
                  <span className="text-emerald-600 font-bold">{"✓"}</span>{" "}
                  Every tradesperson is verified before joining VetMyBuilder.
                </div>
              </aside>

              {/* MAIN CANVAS */}
              <main>
                <div className="mx-auto max-w-xl">
                  {matches && builders.length > 0 ? (
                    <SwipeDeck
                      projectId={String(projectId)}
                      builders={builders}
                      onInfo={(builder) => {
                        if ((builder as any).isRecommendation && (builder as any).recommendationId) {
                          router.push(`/projects/${projectId}/recommendations/${(builder as any).recommendationId}`);
                          return;
                        }
                        const recId = (builder as any).recommendationId;
                        if (builder.tier === "recommended" && recId) {
                          router.push(`/builders/${recId}?projectId=${projectId}`);
                        } else {
                          router.push(`/tradesman/${builder.uid}?projectId=${projectId}`);
                        }
                      }}
                      onInfoPrefetch={(builder) => {
                        if ((builder as any).isRecommendation && (builder as any).recommendationId) {
                          router.prefetch(`/projects/${projectId}/recommendations/${(builder as any).recommendationId}`);
                          return;
                        }
                        const recId = (builder as any).recommendationId;
                        if (builder.tier === "recommended" && recId) {
                          router.prefetch(`/builders/${recId}`);
                        } else if (builder.uid) {
                          router.prefetch(`/tradesman/${builder.uid}`);
                        }
                      }}
                      onMatch={(matchId) => {
                        // Desktop: keep the homeowner on this page. The
                        // new conversation appears in the global
                        // MessagingDock at the bottom-right; we also fire
                        // an event so the dock can pop the chat window
                        // open without the user having to click in.
                        const id = Number(matchId);
                        if (Number.isFinite(id)) {
                          window.dispatchEvent(
                            new CustomEvent("vmb:openChat", { detail: { matchId: id } }),
                          );
                          setMatchCelebration("It's a match");
                          setTimeout(() => setMatchCelebration(null), 5000);
                        }
                      }}
                    />
                  ) : matches && builders.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-amber-100 shadow-sm p-10 text-center min-h-[380px] flex flex-col justify-center">
                      <div className="mx-auto w-20 h-20 rounded-full bg-indigo-50 border-2 border-dashed border-indigo-300 flex items-center justify-center text-3xl">
                        {"\u{1F50D}"}
                      </div>
                      <h3
                        className="mt-5 text-[18px] font-black text-slate-900"
                        style={{ fontFamily: "'Sora', sans-serif" }}
                      >
                        Waiting for your first match
                      </h3>
                      <p className="mt-2 text-[13.5px] text-slate-600 max-w-md mx-auto leading-relaxed">
                        Recommendations from your community land here. We'll also smart-rank verified tradespeople nearby - usually within a few hours.
                      </p>
                      <div className="mt-5 flex justify-center text-[11.5px] text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          Searching nearby
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-3xl border border-amber-100 p-10 text-center shadow-sm min-h-[380px] flex items-center justify-center">
                      <p className="text-slate-400 text-sm">Loading...</p>
                    </div>
                  )}
                </div>
              </main>

              {/* Chat moved to the global LinkedIn-style MessagingDock
                  in _app.tsx so multiple matched conversations live in
                  floating windows at the bottom-right of every page. */}
            </div>
          </div>
        </div>

        <ShareProjectModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          projectId={String(projectId)}
          projectName={project?.name}
        />

        {/* Match-formed celebration overlay: takes over the centre of the
            screen briefly when both sides have right-swiped. The chat panel
            on the right activates at the same moment so as soon as this
            fades, the homeowner can start chatting. */}
        {matchCelebration && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => setMatchCelebration(null)}
            role="dialog"
            aria-label="Match formed"
          >
            <div
              className="relative bg-white rounded-3xl px-10 py-8 text-center shadow-2xl max-w-sm mx-4"
              style={{ animation: "vmbMatchPop 0.4s cubic-bezier(.2,1.4,.4,1)" }}
            >
              <style>{`
                @keyframes vmbMatchPop {
                  0% { transform: scale(0.5); opacity: 0; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
              <div
                className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/40"
                style={{
                  backgroundImage: "linear-gradient(135deg, #10b981, #059669)",
                }}
                aria-hidden
              >
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 21s-7-4.5-7-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.5-7 10-7 10h-4z" />
                </svg>
              </div>
              <div
                className="mt-5 text-[12px] font-extrabold uppercase tracking-[0.2em] text-emerald-700"
              >
                Mutual interest
              </div>
              <h2
                className="mt-1 text-[34px] font-black tracking-tight text-slate-900 leading-none"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                It's a{" "}
                <span
                  className="text-indigo-600"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "115%" }}
                >
                  match
                </span>
              </h2>
              <p className="mt-3 text-[14px] text-slate-600 leading-relaxed">
                Your conversation just opened on the right. Tap anywhere to dismiss and start chatting.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMatchCelebration(null);
                }}
                className="mt-5 w-full rounded-full text-white px-5 py-3 text-[14px] font-bold shadow-md shadow-indigo-500/30 hover:brightness-110"
                style={{
                  backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
                }}
              >
                Open chat
              </button>
            </div>
          </div>
        )}

        {/* Paid-unlock toast: surfaces real-time when a tradesperson pays
            to pitch on this job. Auto-dismisses after 4.5s. */}
        {paidUnlockToast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 rounded-full px-5 py-3 text-white text-[13.5px] font-bold shadow-lg shadow-indigo-500/30"
            style={{
              backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
            }}
            role="status"
          >
            <span>{paidUnlockToast}</span>
          </div>
        )}
      </Layout>
    </>
  );
}

function ProjectSwipeMobile({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [matches, setMatches] = useState<{
    recommended: any[];
    paidUnlock?: any[];
    subscribed: any[];
    recommendationCards?: any[];
  } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [paidUnlockToast, setPaidUnlockToast] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}/matches`);
        if (alive) setMatches(data);
      } catch {
        /* noop - mobile swipe deck is additive */
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, api]);

  useSseEvent<{ type: string; projectId?: number; builderUid?: string }>(
    "deck_card_added",
    async (data) => {
      if (!data || String(data.projectId) !== String(projectId)) return;
      try {
        const { data: fresh } = await api.get(
          `/api/projects/${projectId}/matches`,
        );
        setMatches(fresh);
      } catch {
        /* noop */
      }
      setPaidUnlockToast("A tradesperson just paid to pitch on this job");
      setTimeout(() => setPaidUnlockToast(null), 4500);
    },
  );

  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Back nav row — chevron-left, title centred, edit (pencil) right */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-[15px] font-bold text-gray-500 tracking-tight truncate max-w-[60%] text-center">
          {projectTitle || "Find your builder"}
        </div>
        <button
          type="button"
          aria-label="More project actions"
          onClick={() => setActionsOpen(true)}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <MoreHorizontal className="w-5 h-5 text-gray-700" />
        </button>
      </div>

      {matches && (
        <SwipeDeck
          projectId={String(projectId)}
          builders={[
            ...((matches.recommendationCards || []).map((rc: any) => ({
              uid: `rec-${rc.recommendationId}`,
              displayName: rc.company,
              companyName: rc.company,
              photoUrl: rc.coverPhotoUrl,
              tier: "recommended" as const,
              chVerified: false,
              starRating: null,
              reviewCount: 0,
              yearsTrading: 0,
              primaryTrade: null,
              secondaryTrades: [],
              serviceAreas: [],
              priceBand: null,
              baseScore: 0,
              whyMatch: `Recommended by ${rc.recommenderName}`,
              recommenderName: rc.recommenderName,
              isRecommendation: true,
              recommendationId: rc.recommendationId,
              coverPhotoUrl: rc.coverPhotoUrl,
            }))),
            ...(matches.recommended || []),
            ...(matches.paidUnlock || []),
            ...(matches.subscribed || []),
          ]}
          onInfo={(builder) => {
            if ((builder as any).isRecommendation && (builder as any).recommendationId) {
              router.push(`/projects/${projectId}/recommendations/${(builder as any).recommendationId}`);
              return;
            }
            const recId = (builder as any).recommendationId;
            if (builder.tier === "recommended" && recId) {
              router.push(
                `/builders/${recId}?projectId=${projectId}`,
              );
            } else {
              router.push(
                `/tradesman/${builder.uid}?projectId=${projectId}`,
              );
            }
          }}
          onInfoPrefetch={(builder) => {
            // Warm the Next.js route cache for whichever profile the
            // Info button would navigate to, so the tap feels instant.
            if ((builder as any).isRecommendation && (builder as any).recommendationId) {
              router.prefetch(`/projects/${projectId}/recommendations/${(builder as any).recommendationId}`);
              return;
            }
            const recId = (builder as any).recommendationId;
            if (builder.tier === "recommended" && recId) {
              router.prefetch(`/builders/${recId}`);
            } else if (builder.uid) {
              router.prefetch(`/tradesman/${builder.uid}`);
            }
          }}
          onMatch={(matchId) => router.push(`/match/${matchId}`)}
        />
      )}

      <ProjectActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        projectId={projectId}
        projectName={projectTitle}
      />

      {paidUnlockToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 rounded-full px-5 py-3 text-white text-[13px] font-bold shadow-lg shadow-indigo-500/30 max-w-[calc(100vw-32px)]"
          style={{
            backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
          }}
          role="status"
        >
          <span>{paidUnlockToast}</span>
        </div>
      )}
    </main>
  );
}

/* =====================================================================
 * Closed-project mobile view (read-only) — V1 Hero immersive
 * --------------------------------------------------------------------
 * Shown on mobile when the project status is `completed` or `archived`.
 * Pulls closure + closure photos from the same endpoints the desktop
 * uses; no new server work besides surfacing the winner's profile
 * picture URL.
 *
 * Layout:
 *   1. Full-bleed hero photo with floating back chevron + status pill
 *   2. Title overlaid on dark gradient at the bottom of the hero
 *   3. "Who did the work" winner card (avatar fallback chain)
 *   4. Project details card
 *   5. Description (if present)
 *   6. Photos grid — taps open a fullscreen carousel lightbox
 *
 * Avatar fallback chain (winner card):
 *   profilePictureUrl → first closure photo → initials disc
 * ===================================================================== */

type ClosedProjectMobileProps = {
  projectId: string;
  isCompleted: boolean;
  project: {
    id: number | string;
    name?: string | null;
    type?: string | null;
    location?: string | null;
    propertyType?: string | null;
    bedrooms?: number | null;
    description?: string | null;
    completedAt?: string | null;
    archivedAt?: string | null;
  };
};

type ClosurePhoto = {
  id?: number | string;
  fileUrl?: string | null;
  filePath?: string | null;
};

type Closure = {
  didGoAhead?: boolean;
  reasons?: string[];
  otherReason?: string | null;
  winner?: {
    id?: number;
    name?: string | null;
    company?: string | null;
    tradesmanUid?: string | null;
    profilePictureUrl?: string | null;
  } | null;
};

function ClosedProjectMobile({
  projectId,
  isCompleted,
  project,
}: ClosedProjectMobileProps) {
  const api = useApi();
  const router = useRouter();
  const [photos, setPhotos] = useState<ClosurePhoto[]>([]);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ photos: ClosurePhoto[] }>(
          `/api/projects/${projectId}/close/photos`,
        );
        if (alive) setPhotos(Array.isArray(data?.photos) ? data.photos : []);
      } catch {
        if (alive) setPhotos([]);
      }
    })();
    (async () => {
      try {
        const { data } = await api.get<Closure>(
          `/api/projects/${projectId}/closure`,
        );
        if (alive) setClosure(data || null);
      } catch {
        if (alive) setClosure(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, projectId]);

  const photoUrls = useMemo(
    () =>
      photos
        .map((p) => p.fileUrl || (p.filePath ? String(p.filePath) : null))
        .filter((u): u is string => !!u),
    [photos],
  );

  const heroUrl = photoUrls[0] || null;
  const winnerName =
    closure?.winner?.company || closure?.winner?.name || null;
  const winnerAvatarUrl =
    closure?.winner?.profilePictureUrl || photoUrls[0] || null;
  const closedAt = isCompleted ? project.completedAt : project.archivedAt;
  const formattedDate = closedAt
    ? new Date(closedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  function openLightbox(at: number) {
    setLightboxIdx(at);
  }

  return (
    <main
      className="fixed inset-0 bg-gray-50 overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="closed-project-mobile"
    >
      {/* Hero — full-bleed photo with dark gradient + floating controls */}
      <header
        className="relative w-full bg-gray-200"
        style={{ aspectRatio: heroUrl ? "16 / 12" : "16 / 7" }}
      >
        {heroUrl ? (
          <button
            type="button"
            onClick={() => openLightbox(0)}
            aria-label="Open photo viewer"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroUrl})` }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)",
            }}
          />
        )}
        {/* Bottom dark gradient for legibility */}
        <div
          className="absolute left-0 right-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))",
          }}
        />

        {/* Safe-area top spacer */}
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-0"
          style={{ height: "env(safe-area-inset-top)" }}
        />

        {/* Floating back button */}
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="absolute left-3.5 w-10 h-10 rounded-full flex items-center justify-center text-gray-900 shadow-lg"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(8px)",
          }}
          data-testid="closed-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Floating status pill */}
        <span
          className="absolute right-3.5 inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-extrabold tracking-tight shadow-lg"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 14px)",
            background: isCompleted ? "#6366f1" : "rgba(255,255,255,0.95)",
            color: isCompleted ? "white" : "#374151",
          }}
        >
          {isCompleted ? "Completed" : "Archived"}
        </span>

        {/* Title overlay */}
        <div className="absolute left-5 right-5 bottom-4 text-white">
          <h1 className="text-[24px] font-extrabold tracking-tight leading-tight drop-shadow-md">
            {project.name || "Project"}
          </h1>
          <div
            className="mt-1.5 text-[12.5px] opacity-90 drop-shadow"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
          >
            {[
              isCompleted
                ? formattedDate
                  ? `Completed ${formattedDate}`
                  : "Completed"
                : formattedDate
                ? `Closed ${formattedDate}`
                : "Closed",
              project.location,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </header>

      {/* Winner card */}
      {isCompleted && winnerName && (
        <section className="px-5 pt-5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Who did the work
          </div>
          <div className="px-4 py-3.5 rounded-2xl bg-white border border-gray-200 flex items-center gap-3 shadow-sm">
            <WinnerAvatar
              name={winnerName}
              imageUrl={winnerAvatarUrl}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-extrabold tracking-tight text-gray-900 truncate">
                {winnerName}
              </div>
              <div className="text-[11.5px] text-gray-500 mt-0.5">
                Hired through VetMyBuilder
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Project details */}
      <section className="px-5 pt-5">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
          Project details
        </div>
        <dl className="rounded-2xl border border-gray-200 divide-y divide-gray-100 bg-white">
          <MetaRow label="Type" value={project.type} />
          <MetaRow label="Location" value={project.location} />
          <MetaRow
            label="Property"
            value={
              project.propertyType
                ? `${project.propertyType}${
                    project.bedrooms
                      ? `, ${project.bedrooms} bedroom${project.bedrooms === 1 ? "" : "s"}`
                      : ""
                  }`
                : null
            }
          />
        </dl>
      </section>

      {/* Description */}
      {project.description && project.description.trim() && (
        <section className="px-5 pt-5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Description
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">
            {project.description}
          </div>
        </section>
      )}

      {/* Photos grid (any beyond the hero) — taps open the lightbox */}
      {photoUrls.length > 1 && (
        <section className="px-5 pt-5 pb-8">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Photos
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photoUrls.slice(1).map((src, i) => {
              const at = i + 1; // hero is index 0 in the lightbox order
              return (
                <button
                  key={at}
                  type="button"
                  aria-label={`Open photo ${at + 1}`}
                  onClick={() => openLightbox(at)}
                  className="aspect-square rounded-xl bg-cover bg-center bg-gray-100"
                  style={{ backgroundImage: `url(${src})` }}
                />
              );
            })}
          </div>
        </section>
      )}

      <div className="h-6" />

      {photoUrls.length > 0 && (
        <PhotoLightbox
          open={lightboxIdx !== null}
          photos={photoUrls}
          initialIndex={lightboxIdx ?? 0}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </main>
  );
}

function WinnerAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(imageUrl || null);

  // If the winner image fails to load, fall through to the initials disc.
  useEffect(() => {
    setSrc(imageUrl || null);
  }, [imageUrl]);

  if (src) {
    return (
      <span className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-gray-100">
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setSrc(null)}
        />
      </span>
    );
  }

  const initials = (() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  return (
    <span
      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[15px] shrink-0"
      style={{ background: "linear-gradient(135deg, #6ee7b7, #10b981)" }}
    >
      {initials}
    </span>
  );
}

/**
 * Mobile-only redirect for non-owner viewers. The desktop neighbour /
 * tradesman flows haven't been redesigned for mobile yet, and we don't
 * want pre-redesign layouts bleeding through. Sends the user back to
 * /projects (their own list) and shows nothing in the meantime.
 */
function NonOwnerMobileRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  return (
    <main
      className="fixed inset-0 bg-white flex items-center justify-center"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="project-non-owner-redirect-mobile"
    >
      <div className="text-[13px] font-semibold text-gray-400">
        Returning to your projects…
      </div>
    </main>
  );
}

/**
 * Bare-route mobile 404 used when /projects/[id] errors out (e.g. project
 * deleted, viewer not permitted, or the API is briefly unavailable). Mirrors
 * the desktop 404 content but renders without site chrome so a stale render
 * never bleeds the old layout through.
 */
function ProjectErrorMobile() {
  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto flex items-center justify-center"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="project-view-error-mobile"
    >
      <div className="px-6 py-10 max-w-sm w-full text-center">
        <p className="text-[64px] font-black text-rose-500 leading-none mb-3">
          404
        </p>
        <h1 className="text-[20px] font-extrabold tracking-tight text-gray-900 mb-2">
          Project not found
        </h1>
        <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
          This project doesn&apos;t exist or is no longer available.
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-rose-500/25"
        >
          Back to projects
        </Link>
      </div>
    </main>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <dt className="text-[12px] text-gray-500 font-semibold">{label}</dt>
      <dd className="text-[13px] font-extrabold text-gray-900 text-right truncate max-w-[60%]">
        {value}
      </dd>
    </div>
  );
}

export default function ProjectViewPage() {
  const vm = useProjectView();
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [viewerRole, setViewerRole] = useState<ViewerRole>("unknown");

  // ---------------------------------------------------------
  // 1) Determine role (guest/homeowner/tradesman)
  // ---------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;

    // Not logged in → treat as neighbour (can view live projects, add recs)
    if (!user) {
      setViewerRole("home");
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isTrades =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;

        setViewerRole(isTrades ? "trades" : "home");
      } catch {
        setViewerRole("home");
      }
    })();
  }, [api, user, authLoading]);

  // ---------------------------------------------------------
  // 2) REDIRECT tradesmen away from homeowner project views
  // ---------------------------------------------------------
  useEffect(() => {
    if (viewerRole !== "trades") return;
    router.replace("/tradesman/projects");
  }, [viewerRole, router]);

  // ---------------------------------------------------------
  // 3) Prevent UI render until:
  //    - project is loaded
  //    - role is known
  // ---------------------------------------------------------
  const ready =
    !vm.loading && !vm.errorStatus && !!vm.project && viewerRole !== "unknown";

  // Project not found or inaccessible
  if (!vm.loading && vm.errorStatus && viewerRole !== "unknown") {
    return (
      <>
        <Head>
          <title>Project not found — VetMyBuilder</title>
          <style>{`body { background: #fafaf9 !important; }`}</style>
        </Head>

        {/* MOBILE — bare 404 (no desktop site chrome bleed-through) */}
        <div className="md:hidden">
          <ProjectErrorMobile />
        </div>

        {/* DESKTOP — unchanged 404 inside Layout */}
        <div className="hidden md:block">
          <Layout>
            <div className="overflow-x-hidden min-h-screen">
              <div className="-mt-14 relative min-h-screen flex items-center justify-center overflow-hidden">
                <div className="relative z-10 w-full max-w-lg px-4 sm:px-0 text-center">
                  <Link href="/" className="inline-flex items-center mb-10">
                    <BrandWordmark
                      tone="indigo"
                      className="text-xl font-black tracking-tight text-zinc-900"
                    />
                  </Link>
                  <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-10 sm:p-14">
                    <p className="text-8xl font-black text-red-500 leading-none mb-4">
                      404
                    </p>
                    <h1 className="text-2xl font-black tracking-tight text-zinc-900 mb-3">
                      Project not found
                    </h1>
                    <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                      This project doesn&apos;t exist or is no longer available.
                    </p>
                    <Link
                      href="/"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                    >
                      Back to home
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  if (!ready) {
    return (
      <>
        {/* MOBILE — bare loading (no desktop chrome) */}
        <div className="md:hidden fixed inset-0 bg-white flex items-center justify-center">
          <div
            className="text-[13px] font-semibold text-gray-400"
            data-testid="project-view-loading"
          >
            Loading…
          </div>
        </div>

        {/* DESKTOP — unchanged */}
        <div className="hidden md:block">
          <Layout>
            <div className="-mt-14 relative min-h-screen overflow-hidden">
              <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10 pb-8">
                {vm.loadingUi}
              </div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------
  // 4) Owner branch — mobile/desktop split
  // ---------------------------------------------------------
  if (vm.isOwner) {
    const projectIdStr = String(vm.project?.id ?? "");
    const projectTitle = getShortProjectTitle(vm.project?.name);
    return (
      <>
        <Head>
          <title>
            {vm.project?.name
              ? `${vm.project.name} — VetMyBuilder`
              : "Project — VetMyBuilder"}
          </title>
        </Head>

        {/* MOBILE — bare. Live projects show the swipe deck; closed
            projects show a read-only mobile summary (no swiping). */}
        <div className="md:hidden">
          {vm.isClosed && vm.project ? (
            <ClosedProjectMobile
              projectId={projectIdStr}
              project={vm.project as any}
              isCompleted={vm.isCompleted}
            />
          ) : (
            <ProjectSwipeMobile
              projectId={projectIdStr}
              projectTitle={projectTitle}
            />
          )}
        </div>

        {/* DESKTOP - live projects show the swipe deck (matches mobile UX);
            closed projects keep the existing read-only OwnerProjectView. */}
        <div className="hidden md:block">
          {vm.isClosed || !vm.project ? (
            <Layout>
              <div className="-mt-14 relative min-h-screen overflow-hidden">
                <div
                  className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10"
                  data-testid="project-view-page"
                >
                  <OwnerProjectView vm={vm} />
                  {vm.closeProjectModal}
                  {vm.plansModal}
                </div>
              </div>
            </Layout>
          ) : (
            <ProjectSwipeDesktop
              projectId={projectIdStr}
              projectTitle={projectTitle}
              project={vm.project as any}
            />
          )}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------
  // 5) Tradesman / neighbour branches — wrap in Layout (since
  //    we removed the global Layout wrapper for this path)
  // ---------------------------------------------------------
  let viewContent: React.ReactNode = null;
  if (viewerRole === "home") {
    viewContent = <NeighbourProjectView vm={vm} />;
  } else if (viewerRole === "trades") {
    // Redirect already handled above
    viewContent = <TradesmanProjectView vm={vm} />;
  }

  return (
    <>
      <Head>
        <title>
          {vm.project?.name
            ? `${vm.project.name} — VetMyBuilder`
            : "Project — VetMyBuilder"}
        </title>
      </Head>
      <div className="hidden md:block">
        <Layout>
          <div className="-mt-14 relative min-h-screen overflow-hidden">
            <div
              className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10"
              data-testid="project-view-page"
            >
              {viewContent}
              {vm.closeProjectModal}
              {vm.plansModal}
            </div>
          </div>
        </Layout>
      </div>
      {/* MOBILE — non-owner viewers (tradesman/neighbour branches)
          haven't been mobile-redesigned. Rather than bleed the old
          layout through, redirect to /projects (their own list).
          Desktop continues to show the existing flow. */}
      <div className="md:hidden">
        <NonOwnerMobileRedirect />
      </div>
    </>
  );
}
