// web/components/project/SwipeDeck.tsx
//
// Homeowner-side swipe deck. Tinder-style stack of trade cards: top card
// is draggable, peek-1 sits behind at scale 0.86 / opacity 0.7 so the
// stack visibly reads as a deck. On fling, the top card flies off and
// peek-1 imperatively promotes to scale 1.0 in parallel - no white gap,
// no "wait then jump".
//
// Mirrors the trade-side JobSwipeDeck.tsx (same drag thresholds, fling
// timing, flip animation, and parallel-promote selector). Differences are
// content-only: BuilderCard / BuilderCardBack instead of Job; indigo
// action bar instead of emerald; queue prop-reactivity for paid-unlock
// SSE additions; rec-card dismissal endpoint; ShareProjectModal in empty.
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import {
  trackProjectRecSwiped,
  trackMatchFormed,
} from "@/utils/analytics";
import BuilderCard, { BuilderCardBuilder } from "./BuilderCard";
import BuilderCardBack from "./BuilderCardBack";
import SwipeActionBar from "./SwipeActionBar";
import ShareProjectModal from "./ShareProjectModal";
import MatchShuffleAnimation, {
  type ShuffleFace,
} from "./MatchShuffleAnimation";

// Cards-per-page in the swipe deck. After the homeowner has swiped
// through one page, the "Finding more tradespeople..." loader plays
// (~9s via MatchShuffleAnimation) before the next page reveals. Keeps
// each session focused on a manageable shortlist instead of an
// endless ranked list.
const DECK_PAGE_SIZE = 10;

export interface SwipeDeckBuilder extends BuilderCardBuilder {
  source?: "recommended" | "subscribed" | "paid_unlock";
  recommendationId?: string | number | null;
  // Rec cards (priority slot at top of deck):
  isRecommendation?: boolean;
  recommenderName?: string | null;
  coverPhotoUrl?: string | null;
}

export default function SwipeDeck({
  projectId,
  builders,
  onMatch,
}: {
  projectId: string;
  builders: SwipeDeckBuilder[];
  /** Fired when a mutual right-swipe forms a match. Receives the
   *  swipe_interest row id from the server (the canonical "match id"),
   *  not the builder's UID. */
  onMatch: (matchId: number | string) => void;
}) {
  const api = useApi();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // Batching: deck reveals DECK_PAGE_SIZE cards at a time. Each time
  // the homeowner reaches the end of the current page we play the
  // "Finding more tradespeople..." loader then either reveal the next
  // page or fall through to the All Caught Up state.
  const [pagesShown, setPagesShown] = useState(1);
  const [batchPhase, setBatchPhase] = useState<
    "deck" | "fetching" | "exhausted"
  >("deck");

  // Internal queue snapshot. Parent prop updates (e.g. when a paid_unlock
  // SSE event triggers a matches refetch) are treated as additions and
  // spliced at currentIndex+1 so a new card appears immediately after the
  // one the homeowner is looking at - never replacing it mid-gesture.
  const [queue, setQueue] = useState<SwipeDeckBuilder[]>(builders);

  useEffect(() => {
    setQueue((prev) => {
      if (prev.length === 0) return builders;
      const prevUids = new Set(prev.map((b) => b.uid));
      const additions = builders.filter((b) => !prevUids.has(b.uid));
      if (additions.length === 0) return prev;
      return [
        ...prev.slice(0, index + 1),
        ...additions,
        ...prev.slice(index + 1),
      ];
    });
  }, [builders, index]);

  const current = queue[index];

  // Reset flip whenever the top card changes - a freshly revealed card
  // should always start front-facing.
  useEffect(() => {
    setFlipped(false);
  }, [index]);

  // Returns true if the deck should advance to the next card. False
  // means the same card should stay in place (match navigation handles
  // unmount, or an error - we spring the card back).
  async function commitApi(direction: "left" | "right"): Promise<boolean> {
    if (!current || busy) return false;
    setBusy(true);
    try {
      if (current.isRecommendation && current.recommendationId) {
        // Rec card - dismiss from deck. No swipe-interest recorded; the
        // homeowner has already implicitly endorsed via the friend's rec.
        await api.post(
          `/api/recommendations/${current.recommendationId}/dismiss-from-deck`,
        );
        return true;
      }
      const source =
        current.tier === "recommended"
          ? "recommended"
          : current.tier === "paid_unlock"
            ? "paid_unlock"
            : "subscribed";
      const res = await api.post(`/api/projects/${projectId}/swipe`, {
        builderUid: current.uid,
        direction,
        source,
      });
      trackProjectRecSwiped(direction, current.uid, Number(projectId));
      if (direction === "right" && res.data?.status === "matched") {
        trackMatchFormed(Number(projectId), current.uid, source);
        // Server returns the swipe_interest row id; fall back to uid so
        // older paths that don't surface matchId still navigate (the
        // legacy /match/:id route accepts either).
        const id = res.data?.matchId ?? current.uid;
        onMatch(id);
        return false; // navigation handles unmount
      }
      return true;
    } catch {
      // Errors (other than match navigation) - keep the card in place
      // and spring it back so the user can retry.
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commit(direction: "left" | "right") {
    const advance = await commitApi(direction);
    if (advance) setIndex((i) => i + 1);
  }

  async function unfavouriteRec() {
    if (
      !current ||
      !current.isRecommendation ||
      !current.recommendationId ||
      busy
    )
      return;
    setBusy(true);
    try {
      await api.post(
        `/api/recommendations/${current.recommendationId}/unfavourite`,
      );
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  // ---- drag state ----
  // Held in a ref so pointer-move doesn't re-render the deck on every
  // frame. Transform is applied directly to the card element.
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    lastX: number;
    lastTime: number;
    dx: number;
    velocity: number; // px / ms
  } | null>(null);
  const animatingRef = useRef(false);

  function applyCardTransform(dx: number, immediate: boolean) {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = immediate
      ? "none"
      : "transform 220ms cubic-bezier(0.4, 0.0, 0.2, 1)";
    // Compose with rank-0 identity so format matches React-controlled
    // transform on peek cards. CSS reads it as one matrix.
    el.style.transform = `scale(1) translateX(${dx}px) rotate(${dx / 20}deg)`;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy || animatingRef.current) return;
    cardRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      lastTime: e.timeStamp,
      dx: 0,
      velocity: 0,
    };
    applyCardTransform(0, true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (Math.abs(e.clientX - s.startX) > 4) e.preventDefault();
    const dt = Math.max(1, e.timeStamp - s.lastTime);
    s.velocity = (e.clientX - s.lastX) / dt;
    s.lastX = e.clientX;
    s.lastTime = e.timeStamp;
    s.dx = e.clientX - s.startX;
    applyCardTransform(s.dx, true);
  }

  async function flingAndCommit(direction: "left" | "right", width: number) {
    animatingRef.current = true;
    const flingTo = direction === "right" ? width * 1.5 : -width * 1.5;
    const el = cardRef.current;
    if (el) {
      el.style.transition = "transform 500ms cubic-bezier(0.4, 0.0, 0.2, 1)";
      el.style.transform = `scale(1) translateX(${flingTo}px) rotate(${flingTo / 20}deg)`;
    }
    // Animate peek-1 forward IN PARALLEL with the fling. By querying
    // its element directly and applying the transform imperatively, we
    // guarantee the browser starts the transition at the moment the
    // fling does, not after the React re-render that follows setIndex.
    // Result: while the top flies off, the next card is already growing
    // into the top slot - finishes at the same moment, no perceptible
    // "wait then jump" between fly-off and promote.
    const peekEl = el?.parentElement?.querySelector(
      '[data-card-rank="1"]',
    ) as HTMLElement | null;
    if (peekEl) {
      peekEl.style.transition =
        "transform 500ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease-out";
      peekEl.style.transform = "scale(1)";
      peekEl.style.opacity = "1";
    }
    // Run the fling in parallel with the API. Hold setIndex until both
    // finish so the leaving card stays mid-flight while the network
    // round-trip completes. If commitApi returns false (match
    // navigation, or an error) we DON'T advance the index - but we
    // still have to bring the card back, otherwise it's stuck off-
    // screen and the deck looks empty under a flown-off card the user
    // can't see.
    const [, advance] = await Promise.all([
      new Promise<void>((r) => window.setTimeout(r, 500)),
      commitApi(direction).catch(() => false as boolean),
    ]);
    if (advance) {
      setIndex((i) => i + 1);
    } else {
      applyCardTransform(0, false);
    }
    animatingRef.current = false;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    cardRef.current?.releasePointerCapture(e.pointerId);
    dragRef.current = null;

    const width = cardRef.current?.offsetWidth ?? 320;
    const { dx, velocity } = s;
    const farEnough = Math.abs(dx) / width > 0.25;
    // Flick threshold - 0.5 px/ms == 500px/sec. A ~150px flick over
    // 300ms satisfies this even though it's well below the distance
    // threshold.
    const fastEnough = Math.abs(velocity) > 0.5 && Math.abs(dx) > 20;
    if (farEnough || fastEnough) {
      const direction: "left" | "right" =
        dx !== 0 ? (dx > 0 ? "right" : "left") : velocity > 0 ? "right" : "left";
      void flingAndCommit(direction, width);
      return;
    }
    applyCardTransform(0, false);
  }

  // Page-batch transition. When the homeowner's index reaches the end
  // of the currently revealed page, swap the deck for the fetching
  // loader. The loader's onSettled callback (below) decides whether
  // to reveal the next page or transition to the exhausted state.
  const revealedCount = Math.min(pagesShown * DECK_PAGE_SIZE, queue.length);
  useEffect(() => {
    if (queue.length === 0) return;
    if (batchPhase !== "deck") return;
    if (index < revealedCount) return;
    setBatchPhase("fetching");
  }, [index, revealedCount, queue.length, batchPhase]);

  // Faces for the "Finding more tradespeople..." loader: prefer the
  // upcoming batch's photos so the cycle teases who's coming next.
  // Falls back to the previous batch when the user is about to land
  // on the All Caught Up screen (no upcoming page exists).
  const fetchingFaces = useMemo<ShuffleFace[] | undefined>(() => {
    const upcomingStart = revealedCount;
    const upcomingEnd = Math.min(
      revealedCount + DECK_PAGE_SIZE,
      queue.length,
    );
    const sourceSlice =
      upcomingEnd > upcomingStart
        ? queue.slice(upcomingStart, upcomingEnd)
        : queue.slice(Math.max(0, queue.length - DECK_PAGE_SIZE));
    const photos = sourceSlice
      .map((b) => b.photoUrl)
      .filter((u): u is string => !!u);
    if (photos.length === 0) return undefined;
    const palette = [
      { from: "#a78bfa", to: "#7c3aed" },
      { from: "#fb923c", to: "#ea580c" },
      { from: "#34d399", to: "#059669" },
      { from: "#60a5fa", to: "#2563eb" },
      { from: "#f472b6", to: "#db2777" },
      { from: "#ef4444", to: "#b91c1c" },
    ];
    const frames = Math.max(6, photos.length);
    return Array.from({ length: frames }, (_, i) => ({
      initial: "",
      photoUrl: photos[i % photos.length],
      from: palette[i % palette.length].from,
      to: palette[i % palette.length].to,
    }));
  }, [queue, revealedCount]);

  function onFetchingSettled() {
    // After the loader: reveal the next page, or - if every card in
    // the queue is already revealed - transition to All Caught Up.
    if (revealedCount >= queue.length) {
      setBatchPhase("exhausted");
    } else {
      setPagesShown((p) => p + 1);
      setBatchPhase("deck");
    }
  }

  if (queue.length === 0) {
    // Freshly-posted project with zero candidates - "Searching for
    // tradespeople" copy (no batching loader: there's nothing to load).
    return <SwipeDeckEmpty projectId={projectId} noBuildersYet />;
  }

  if (batchPhase === "fetching") {
    return (
      <div className="relative min-h-[420px] md:min-h-[560px] flex flex-col items-center justify-center px-7 py-6 text-center">
        <MatchShuffleAnimation
          active
          onSettled={onFetchingSettled}
          faces={fetchingFaces}
        />
        <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="w-3 h-3"
            fill="currentColor"
          >
            <path d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
          </svg>
          Finding more tradespeople
        </div>
        <h2
          className="mt-2 font-black tracking-tight text-slate-900 text-xl sm:text-2xl"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Your next shortlist is on the way
        </h2>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-[300px]">
          Pulling in the next batch of local matches for your project.
        </p>
      </div>
    );
  }

  if (batchPhase === "exhausted" || !current) {
    return (
      <SwipeDeckEmpty
        projectId={projectId}
        noBuildersYet={false}
      />
    );
  }

  // Clamp the visible peek window to the current page so the stack
  // doesn't leak cards from the next batch behind the active one.
  const visibleEnd = Math.min(index + 4, revealedCount);
  const visible = queue.slice(index, visibleEnd);

  // Peek-1 sits behind at scale 0.86 / opacity 0.7 - visibly smaller +
  // faded so the deck reads as a stack. When the top flies off the user
  // sees the peek immediately (no white gap). After setIndex the CSS
  // transition animates transform 0.86 -> 1.0 + opacity 0.7 -> 1.0 so
  // the card visibly glides forward into the top slot.
  function rankTransform(i: number) {
    if (i === 0) return "scale(1)";
    return `scale(${1 - i * 0.14})`;
  }
  function rankOpacity(i: number) {
    if (i === 0) return 1;
    if (i === 1) return 0.7;
    return 0;
  }

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Desktop-only action bar above the card (user-testing redesign).
          Mobile keeps the legacy "buttons below the card" layout — the
          duplicate bar at the bottom of this component handles that.
          Rendering twice + responsive-hiding is the cheapest way to
          flip vertical position purely with Tailwind classes. */}
      <div className="hidden md:flex px-4 pt-0 pb-2 items-center justify-center">
        <SwipeActionBar
          disabled={busy}
          onPass={() => commit("left")}
          onInfo={() => setFlipped((v) => !v)}
          onLike={() => commit("right")}
          floating
        />
      </div>
      {/* Card stack - takes available vertical space, padded so the card
          doesn't kiss the screen edges and the rounded corners + drop
          shadow have room to breathe. Desktop bumps to 560px so the
          photo gets more presence (page-level paddings around the deck
          have been trimmed elsewhere so this still fits a standard
          laptop viewport without scrolling); mobile stays at the legacy
          420px so the bottom action bar still fits on smaller phones. */}
      <div className="relative flex-1 min-h-[420px] md:min-h-[560px] mx-4 mt-1 mb-2">
        {visible.map((b, i) => {
          const isTop = i === 0;
          return (
            <div
              key={b.uid}
              ref={isTop ? cardRef : undefined}
              data-testid={isTop ? "swipe-top-card" : undefined}
              data-card-rank={i}
              aria-hidden={!isTop}
              onPointerDown={isTop && !flipped ? onPointerDown : undefined}
              onPointerMove={isTop && !flipped ? onPointerMove : undefined}
              onPointerUp={isTop && !flipped ? onPointerUp : undefined}
              onPointerCancel={isTop && !flipped ? onPointerUp : undefined}
              onContextMenu={isTop ? (e) => e.preventDefault() : undefined}
              onDragStart={isTop ? (e) => e.preventDefault() : undefined}
              className={`absolute inset-0 ${isTop && !flipped ? "touch-none select-none" : ""} ${isTop ? "will-change-transform" : ""}`}
              style={
                {
                  zIndex: 10 - i,
                  pointerEvents: isTop ? "auto" : "none",
                  transformOrigin: "center center",
                  transform: rankTransform(i),
                  opacity: rankOpacity(i),
                  transition:
                    "transform 280ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease-out",
                  perspective: "1200px",
                  willChange: "transform, opacity",
                  contain: "layout paint",
                  // touch-action:none locks out scroll inside the back face
                  // (its overflow-y-auto can't pan when an ancestor blocks
                  // touch). Apply only while the front face owns the gesture.
                  touchAction: isTop && !flipped ? "none" : "auto",
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  WebkitUserDrag: "none",
                } as React.CSSProperties
              }
            >
              {/* Flip wrapper - just the rotation. We CANNOT put
                  overflow:hidden or rounded corners on this element
                  because both coerce a preserve-3d element to "flat"
                  rendering in Safari, which collapses the front and
                  back faces onto the same plane (mirrored content
                  showing through). Rounded shape + shadow live on each
                  face individually so the card visually reads as one
                  rounded piece during the flip. */}
              <div
                className="relative w-full h-full"
                data-flip-wrapper={isTop ? "true" : "false"}
                data-flipped={isTop && flipped ? "true" : "false"}
                style={{
                  transformStyle: "preserve-3d",
                  transition: isTop
                    ? "transform 0.55s cubic-bezier(0.4, 0.0, 0.2, 1)"
                    : "none",
                  transform:
                    isTop && flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  // Block child pointer events ONLY while the front face
                  // owns the swipe gesture. Without this, iOS Safari picks
                  // up "tap" hits on the gradient overlay or chip elements
                  // and treats drag-start as text-select. When flipped,
                  // the back face needs real clicks (photo lightbox) so we
                  // re-enable.
                  pointerEvents: isTop && flipped ? "auto" : "none",
                }}
              >
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "translateZ(0)",
                    boxShadow: isTop
                      ? "0 18px 48px rgba(15,23,42,0.22), 0 4px 14px rgba(15,23,42,0.10)"
                      : "none",
                  }}
                >
                  <BuilderCard
                    builder={b}
                    onUnfavouriteRec={isTop ? unfavouriteRec : undefined}
                  />
                </div>
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg) translateZ(0)",
                    boxShadow: isTop
                      ? "0 18px 48px rgba(15,23,42,0.22), 0 4px 14px rgba(15,23,42,0.10)"
                      : "none",
                  }}
                >
                  <BuilderCardBack builder={b} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile-only action bar below the card (legacy layout). The
          desktop variant lives at the top of this component. */}
      <div className="md:hidden px-4 pb-4 pt-1 flex items-center justify-center">
        <SwipeActionBar
          disabled={busy}
          onPass={() => commit("left")}
          onInfo={() => setFlipped((v) => !v)}
          onLike={() => commit("right")}
          floating
        />
      </div>
    </div>
  );
}

const CONFETTI: Array<{ left: string; top: string; bg: string; rot: number }> = [
  { left: "12%", top: "14%", bg: "#fde047", rot: 15 },
  { left: "78%", top: "12%", bg: "#6366f1", rot: -25 },
  { left: "25%", top: "24%", bg: "#f87171", rot: 45 },
  { left: "65%", top: "30%", bg: "#34d399", rot: 20 },
  { left: "50%", top: "18%", bg: "#a78bfa", rot: -15 },
  { left: "18%", top: "78%", bg: "#34d399", rot: 30 },
  { left: "80%", top: "72%", bg: "#fde047", rot: -10 },
  { left: "35%", top: "84%", bg: "#6366f1", rot: 50 },
  { left: "55%", top: "80%", bg: "#f472b6", rot: -30 },
];

function SwipeDeckEmpty({
  projectId,
  noBuildersYet = false,
}: {
  projectId: string;
  noBuildersYet?: boolean;
}) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);

  const heading = noBuildersYet
    ? "Searching for tradespeople"
    : "You're all caught up";
  const sub = noBuildersYet
    ? "We're finding tradespeople in your area who match this job - usually within minutes. Tap Share below to speed it up, or open ⋯ to edit the project details."
    : "You've swiped through every tradesperson we have for this project. We'll ping you the moment a new match comes in.";
  const icon = noBuildersYet ? "🔎" : "✓";

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
          background: "linear-gradient(135deg, #c7d2fe, #a5b4fc)",
          boxShadow: "0 12px 36px rgba(99,102,241,0.25)",
        }}
      >
        <span
          className={
            noBuildersYet
              ? "text-[44px] leading-none"
              : "text-white text-[44px] leading-none font-bold"
          }
        >
          {icon}
        </span>
      </div>

      <h2 className="relative text-[26px] font-extrabold tracking-[-0.02em] leading-[1.2] text-gray-900">
        {heading}
      </h2>
      <p className="relative mt-2.5 text-[14px] text-gray-500 leading-[1.5] max-w-[290px]">
        {sub}
      </p>

      <div className="relative mt-7 w-full max-w-[320px] flex flex-col gap-2.5">
        {!noBuildersYet && (
          <button
            onClick={() => router.push("/matches")}
            className="flex items-center justify-center gap-2 py-4 px-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_10px_24px_rgba(99,102,241,0.3)]"
          >
            See your matches
          </button>
        )}
        <button
          onClick={() => setShareOpen(true)}
          className={
            noBuildersYet
              ? "flex items-center justify-center gap-2 py-4 px-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_10px_24px_rgba(99,102,241,0.3)]"
              : "flex items-center justify-center gap-2 py-4 px-5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-700 font-extrabold text-[15px] tracking-tight"
          }
        >
          {noBuildersYet
            ? "Share project to speed it up"
            : "Share project to find more"}
        </button>
      </div>

      <ShareProjectModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
