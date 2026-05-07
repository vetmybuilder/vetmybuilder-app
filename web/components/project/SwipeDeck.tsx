import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import BuilderCard, { BuilderCardBuilder } from "./BuilderCard";
import BuilderCardBack from "./BuilderCardBack";
import SwipeActionBar from "./SwipeActionBar";
import ShareProjectModal from "./ShareProjectModal";

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

  // Reset the flip state whenever the top card changes — a freshly revealed
  // card should always start front-facing.
  useEffect(() => {
    setFlipped(false);
  }, [index]);

  async function commitApi(direction: "left" | "right") {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (current.isRecommendation && current.recommendationId) {
        // Rec card — dismiss from deck. No swipe-interest recorded; the
        // homeowner has already implicitly endorsed via the friend's rec.
        await api.post(`/api/recommendations/${current.recommendationId}/dismiss-from-deck`);
      } else {
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
        if (direction === "right" && res.data?.status === "matched") {
          // Server returns the swipe_interest row id; fall back to uid
          // so older paths that don't surface matchId still navigate
          // (the legacy /match/:id route accepts either).
          const id = res.data?.matchId ?? current.uid;
          onMatch(id);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function commit(direction: "left" | "right") {
    await commitApi(direction);
    setIndex(i => i + 1);
  }

  async function unfavouriteRec() {
    if (!current || !current.isRecommendation || !current.recommendationId || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/recommendations/${current.recommendationId}/unfavourite`);
      setIndex(i => i + 1);
    } finally {
      setBusy(false);
    }
  }

  // Drag state is held in a ref so pointer-move doesn't trigger a React
  // re-render on every frame. Transform is applied directly to the card
  // element via the ref — that's what makes the gesture feel smooth.
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
    // Compose with the rank-0 identity (translateY(0) scale(1)) so the
    // string format matches what React puts on the peek cards. CSS reads
    // this whole transform as one matrix - the card never appears to
    // "lose" its position when JS hands control back to React.
    el.style.transform = `translateY(0) scale(1) translateX(${dx}px) rotate(${dx / 20}deg)`;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy || animatingRef.current) return;
    // Don't preventDefault here on iOS Safari — doing so causes the
    // matching pointerup not to fire, which leaves the card stuck mid-
    // drag. We still own the gesture via touch-action: none + setPointer
    // Capture, and rely on preventDefault during pointermove (where we
    // know it's a real drag, not just a tap) to block native scroll.
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
    // preventDefault here cancels iOS's competing scroll/zoom gestures
    // once we know the user is actively dragging — but only after a
    // small movement so a held tap can still go through cleanly.
    if (Math.abs(e.clientX - s.startX) > 4) e.preventDefault();
    const dt = Math.max(1, e.timeStamp - s.lastTime);
    s.velocity = (e.clientX - s.lastX) / dt;
    s.lastX = e.clientX;
    s.lastTime = e.timeStamp;
    s.dx = e.clientX - s.startX;
    applyCardTransform(s.dx, true);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    cardRef.current?.releasePointerCapture(e.pointerId);
    dragRef.current = null;

    const width = cardRef.current?.offsetWidth ?? 320;
    const { dx, velocity } = s;
    const farEnough = Math.abs(dx) / width > 0.25;
    // Flick threshold — 0.5 px/ms == 500px/sec. A ~150px flick over 300ms
    // satisfies this even though it's well below the distance threshold.
    const fastEnough = Math.abs(velocity) > 0.5 && Math.abs(dx) > 20;

    if (farEnough || fastEnough) {
      const direction: "left" | "right" =
        dx !== 0 ? (dx > 0 ? "right" : "left") : velocity > 0 ? "right" : "left";
      flingAndCommit(direction, width);
      return;
    }
    // Below threshold — animate back to 0.
    applyCardTransform(0, false);
  }

  async function flingAndCommit(direction: "left" | "right", width: number) {
    animatingRef.current = true;
    const flingTo = direction === "right" ? width * 1.5 : -width * 1.5;
    const el = cardRef.current;
    if (el) {
      el.style.transition = "transform 800ms cubic-bezier(0.4, 0.0, 0.2, 1)";
      el.style.transform = `translateY(0) scale(1) translateX(${flingTo}px) rotate(${flingTo / 20}deg)`;
    }
    // Run the fling animation in parallel with the API. Hold setIndex
    // until both finish so the leaving card stays mid-flight while the
    // network round-trip completes. Once setIndex fires, the leaving
    // card unmounts (taking its transform with it), and the peek-1 card
    // - which kept its DOM through the whole gesture - has its
    // React-controlled transform updated from the rank-1 stack offset
    // to rank-0 identity. The 350ms CSS transition on the peek's outer
    // wrapper smoothly animates that up-and-into-the-top motion. No
    // imperative reset on the new top is needed; React + CSS handle it.
    await Promise.all([
      new Promise<void>((r) => window.setTimeout(r, 800)),
      commitApi(direction).catch(() => {}),
    ]);
    setIndex((i) => i + 1);
    animatingRef.current = false;
  }

  if (!current) {
    // Differentiate "freshly posted, no candidates yet" from "you've
    // swiped through every candidate". If the array is empty from the
    // start, it's the former; otherwise the user worked through it.
    return (
      <SwipeDeckEmpty
        projectId={projectId}
        noBuildersYet={queue.length === 0}
      />
    );
  }

  // Tinder-style stacked deck. Top + 3 peeks are mounted as siblings
  // keyed by uid - DOM is stable across swipes, so when peek-1 becomes
  // the new top its image, pills, and back face are already rendered
  // (no flash where content "loads in" after the photo).
  //
  // Each card has a rank-based base transform: peek-1 sits 6px lower
  // and 4% smaller than the top, peek-2 is 12px down and 8% smaller,
  // etc. CSS transitions run on every card's transform, so when the
  // top flies off and index advances, peek-1's rank drops from 1 to 0
  // and it smoothly animates UP into the top slot - the canonical
  // Tinder "card rises" feel.
  //
  // Drag transform on the top is applied imperatively via cardRef on
  // top of the rank-0 baseline - same translateX + rotate as before.
  const visible = queue.slice(index, index + 4);

  // Pure-CSS rank transforms. Top is identity; peeks scale down and
  // offset down by their rank. Kept gentle so chips/pills don't pick
  // up subpixel artefacts at scale != 1.
  function rankTransform(i: number) {
    if (i === 0) return "translateY(0) scale(1)";
    return `translateY(${i * 6}px) scale(${1 - i * 0.04})`;
  }
  function rankOpacity(i: number) {
    if (i === 0) return 1;
    if (i === 1) return 0.96;
    if (i === 2) return 0.85;
    return 0.7;
  }

  return (
    <div className="relative h-full">
      <div className="relative h-full min-h-[460px]">
        {visible.map((b, i) => {
          const isTop = i === 0;
          return (
            <div
              key={b.uid}
              ref={isTop ? cardRef : undefined}
              data-testid={isTop ? "swipe-top-card" : undefined}
              aria-hidden={!isTop}
              onPointerDown={isTop && !flipped ? onPointerDown : undefined}
              onPointerMove={isTop && !flipped ? onPointerMove : undefined}
              onPointerUp={isTop && !flipped ? onPointerUp : undefined}
              onPointerCancel={isTop && !flipped ? onPointerUp : undefined}
              onContextMenu={isTop ? (e) => e.preventDefault() : undefined}
              onDragStart={isTop ? (e) => e.preventDefault() : undefined}
              className={`absolute inset-0 ${isTop ? "touch-none select-none will-change-transform" : ""}`}
              // The rank transform lives on this outer div and has a CSS
              // transition. When index advances, peek-1's rank changes
              // from 1 -> 0, and CSS animates its translateY/scale to
              // identity over 350ms. The drag handlers override this
              // transform imperatively while a finger is down (transition
              // disabled during drag, re-enabled on release).
              style={
                {
                  zIndex: 10 - i,
                  pointerEvents: isTop ? "auto" : "none",
                  transformOrigin: "top center",
                  transform: rankTransform(i),
                  opacity: rankOpacity(i),
                  transition:
                    "transform 350ms cubic-bezier(0.2, 0, 0, 1), opacity 350ms ease",
                  perspective: "1200px",
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  WebkitUserDrag: "none",
                } as React.CSSProperties
              }
            >
              <div
                className="relative w-full h-full"
                style={{
                  transformStyle: "preserve-3d",
                  transition: isTop
                    ? "transform 0.55s cubic-bezier(0.4, 0.0, 0.2, 1)"
                    : "none",
                  transform:
                    isTop && flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "translateZ(0)",
                  }}
                >
                  <BuilderCard
                    builder={b}
                    onUnfavouriteRec={isTop ? unfavouriteRec : undefined}
                  />
                </div>
                <div
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg) translateZ(0)",
                  }}
                >
                  <BuilderCardBack builder={b} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Floating action bar — sits absolute over the bottom of the
            top card so it reads as part of the photo. Pass / Info / Like
            with the indigo Like as the primary action (homeowner brand). */}
        <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <SwipeActionBar
              disabled={busy}
              onPass={() => commit("left")}
              onInfo={() => setFlipped((v) => !v)}
              onLike={() => commit("right")}
              floating
            />
          </div>
        </div>
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
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
        <span className={noBuildersYet ? "text-[44px] leading-none" : "text-white text-[44px] leading-none font-bold"}>
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
          {noBuildersYet ? "Share project to speed it up" : "Share project to find more"}
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
