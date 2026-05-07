// web/components/tradesmen/JobSwipeDeck.tsx
//
// Tradesman-side swipe deck. Forked from SwipeDeck.tsx — same drag
// thresholds, flip animation timing, and action-bar wiring; just renders
// JobCard/JobCardBack instead of BuilderCard/BuilderCardBack.
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import JobCard, { JobCardData } from "./JobCard";
import JobCardBack from "./JobCardBack";
import SwipeActionBar from "@/components/project/SwipeActionBar";
import SwipePayGate, {
  type SwipePayGateSubject,
} from "./SwipePayGate";
import Link from "next/link";

export default function JobSwipeDeck({
  jobs,
  onConsumed,
  onTopChange,
  noJobsYet = false,
}: {
  jobs: JobCardData[];
  /** Called after every swipe so the parent can track remaining count. */
  onConsumed?: () => void;
  /** Called whenever the top card changes (initial mount + after each
   *  swipe). Lets the parent surface the current job's details outside
   *  the deck (e.g. desktop left rail). */
  onTopChange?: (job: JobCardData | null) => void;
  /** True when there are zero live projects in the system at all (vs the
   *  tradesman having swiped through every available one). Drives the
   *  empty-state copy. */
  noJobsYet?: boolean;
}) {
  const api = useApi();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [paygate, setPaygate] = useState<SwipePayGateSubject | null>(null);

  const current = jobs[index];

  // Reset flip whenever the top card changes
  useEffect(() => {
    setFlipped(false);
  }, [index]);

  // Surface the current top card to the parent so it can render
  // ancillary UI (e.g. the desktop left-rail job summary).
  useEffect(() => {
    onTopChange?.(current ?? null);
  }, [current, onTopChange]);

  // Returns true if the deck should advance to the next card. False
  // means the same card should stay in place (match navigation, paygate,
  // unrecoverable error).
  async function commitApi(direction: "left" | "right"): Promise<boolean> {
    if (!current || busy) return false;
    setBusy(true);
    try {
      const res = await api.post(
        `/api/tradesmen/jobs/${current.projectId}/swipe`,
        { decision: direction === "right" ? "right" : "left" },
      );
      if (direction === "right" && res.data?.matched) {
        router.push(`/match/${current.projectId}`);
        return false; // navigation handles unmount
      }
      onConsumed?.();
      return true;
    } catch (err: any) {
      // Server gates subscribed-tier right-swipes behind an active
      // subscription. Open the in-app pay-gate so the builder can pick a
      // pass (or pay one-off) without leaving /tradesman/jobs. Do NOT
      // advance the deck index — the same card stays as the top card so
      // the right-swipe still feels intentional after they pay.
      if (
        err?.response?.status === 403 &&
        err?.response?.data?.requiresSubscription
      ) {
        setPaygate({
          projectId: current.projectId,
          title: current.title,
          location: current.location,
          type: current.type,
          priceBandLabel: current.priceBandEstimate ?? null,
        });
        return false;
      }
      // Any other error - swallow rather than crash the deck. The card
      // stays in place; the user can retry.
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commit(direction: "left" | "right") {
    const advance = await commitApi(direction);
    if (advance) setIndex((i) => i + 1);
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
    velocity: number;
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
    // its element directly and applying the transform imperatively,
    // we guarantee the browser starts the transition at the moment
    // the fling does, not after the React re-render that follows
    // setIndex. Result: while the top flies off, the next card is
    // already growing into the top slot - finishes at the same moment,
    // no perceptible "wait then jump" between fly-off and promote.
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
    // round-trip completes. If commitApi returns false (paygate fired,
    // match navigation, etc.) we DON'T advance the index - but we still
    // have to bring the card back, otherwise it's stuck off-screen and
    // the deck looks empty under a flown-off card the user can't see.
    const [, advance] = await Promise.all([
      new Promise<void>((r) => window.setTimeout(r, 500)),
      commitApi(direction).catch(() => false as boolean),
    ]);
    if (advance) {
      setIndex((i) => i + 1);
    } else {
      // Spring the card back to origin so the user (e.g. post-paygate)
      // can re-swipe the same card.
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
    const fastEnough = Math.abs(velocity) > 0.5 && Math.abs(dx) > 20;
    if (farEnough || fastEnough) {
      const direction: "left" | "right" =
        dx !== 0 ? (dx > 0 ? "right" : "left") : velocity > 0 ? "right" : "left";
      void flingAndCommit(direction, width);
      return;
    }
    applyCardTransform(0, false);
  }

  if (!current) {
    return <JobSwipeDeckEmpty noJobsYet={noJobsYet} />;
  }

  // Tinder-style stacked deck. Top + 3 peeks mounted as siblings keyed
  // by projectId - DOM stable across swipes, so when peek-1 becomes the
  // new top its image, pills, and back face are already rendered (no
  // flash where content "loads in" after the photo).
  //
  // Each card has a rank-based scale: peek-1 sits at scale(0.92) behind
  // the top (same position, just smaller). When the top flies off and
  // index advances, peek-1's rank drops 1 -> 0 and CSS transitions its
  // transform from scale(0.92) up to scale(1) - the canonical Tinder
  // "card zooms towards you" feel.
  const visible = jobs.slice(index, index + 4);

  // Peek-1 sits behind at scale 0.86 / opacity 0.7 - visibly smaller +
  // faded so the deck reads as a stack. When the top flies off, the
  // user sees the peek immediately (no white gap). After setIndex the
  // CSS transition animates transform 0.86 → 1.0 + opacity 0.7 → 1.0
  // over 700ms with exponential-out ease, so the card visibly glides
  // forward into the top slot rather than snapping to size.
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
      {/* Card stack - takes available vertical space, padded so the card
          doesn't kiss the screen edges and the rounded corners + drop
          shadow have room to breathe. */}
      <div className="relative flex-1 min-h-[420px] mx-4 mt-2 mb-3">
        {visible.map((j, i) => {
          const isTop = i === 0;
          return (
            <div
              key={j.projectId}
              ref={isTop ? cardRef : undefined}
              data-testid={isTop ? "job-swipe-top-card" : undefined}
              data-card-rank={i}
              aria-hidden={!isTop}
              onPointerDown={isTop && !flipped ? onPointerDown : undefined}
              onPointerMove={isTop && !flipped ? onPointerMove : undefined}
              onPointerUp={isTop && !flipped ? onPointerUp : undefined}
              onPointerCancel={isTop && !flipped ? onPointerUp : undefined}
              onContextMenu={isTop ? (e) => e.preventDefault() : undefined}
              onDragStart={isTop ? (e) => e.preventDefault() : undefined}
              className={`absolute inset-0 ${isTop ? "touch-none select-none will-change-transform" : ""}`}
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
                  // touchAction: none on the inline style as well as the
                  // class belt-and-braces - on iOS Safari Tailwind's
                  // touch-none class can be overridden by parent flex
                  // styles that set touch-action: pan-y.
                  touchAction: "none",
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
                  // Block all child pointer events. The wrapper above
                  // owns the swipe gesture; without this, iOS Safari
                  // can pick up "tap" hits on the gradient overlay or
                  // chip elements and treat the start of a drag as
                  // text-select, which feels like the swipe needs the
                  // user to find a "blank" spot before responding.
                  pointerEvents: "none",
                }}
              >
                <div
                  className="absolute inset-0 rounded-3xl overflow-hidden"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "translateZ(0)",
                    boxShadow: isTop
                      ? "0 18px 48px rgba(15,23,42,0.22), 0 4px 14px rgba(15,23,42,0.10)"
                      : "none",
                  }}
                >
                  <JobCard data={j} />
                </div>
                <div
                  className="absolute inset-0 rounded-3xl overflow-hidden"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg) translateZ(0)",
                    boxShadow: isTop
                      ? "0 18px 48px rgba(15,23,42,0.22), 0 4px 14px rgba(15,23,42,0.10)"
                      : "none",
                  }}
                >
                  <JobCardBack data={j} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action bar - now OUTSIDE / BELOW the card. Pass / Info / Like
          sit on the page chrome, not floating over the photo, so the
          card reads as a clean photo tile. */}
      <div className="px-4 pb-4 pt-1 flex items-center justify-center">
        <SwipeActionBar
          tone="emerald"
          disabled={busy}
          onPass={() => commit("left")}
          onInfo={() => setFlipped((v) => !v)}
          onLike={() => commit("right")}
          floating
        />
      </div>

      <SwipePayGate
        open={paygate !== null}
        subject={paygate}
        onClose={() => setPaygate(null)}
      />
    </div>
  );
}

// ---- Confetti decorations for empty state ----
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

function JobSwipeDeckEmpty({ noJobsYet = false }: { noJobsYet?: boolean }) {
  // Two flavours of empty state:
  //   - noJobsYet: there are zero live projects in the system at all.
  //   - else: the tradesman has swiped through every available job.
  const heading = noJobsYet ? "No jobs posted yet" : "You're all caught up!";
  const sub = noJobsYet
    ? "Be ready - we'll surface new jobs as homeowners post them. You'll get a push notification the moment one matches your trades."
    : "You've swiped through every job near you. We'll surface new ones as they come in.";
  const icon = noJobsYet ? "🛠️" : "✓";
  return (
    <div className="relative min-h-[520px] flex flex-col items-center justify-center px-7 py-10 text-center overflow-hidden">
      {/* Confetti */}
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

      {/* Icon circle */}
      <div
        className="relative w-24 h-24 rounded-full flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg, #6ee7b7, #10b981)",
          boxShadow: "0 12px 36px rgba(16,185,129,0.25)",
        }}
      >
        <span className="text-white text-[44px] leading-none font-bold">
          {icon}
        </span>
      </div>

      <h2 className="relative text-[26px] font-extrabold tracking-[-0.02em] leading-[1.2] text-gray-900">
        {heading}
      </h2>
      <p className="relative mt-2.5 text-[14px] text-gray-500 leading-[1.5] max-w-[290px]">
        {sub}
      </p>

      {!noJobsYet && (
        <div className="relative mt-7 w-full max-w-[320px]">
          <Link
            href="/tradesman/jobs/list"
            className="flex items-center justify-center gap-2 py-4 px-5 rounded-2xl text-white font-extrabold text-[15px] tracking-tight shadow-[0_10px_24px_rgba(16,185,129,0.3)]"
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
            }}
          >
            Browse all jobs &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
