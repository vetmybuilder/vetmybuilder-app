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
    el.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
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
      el.style.transition = "transform 250ms cubic-bezier(0.4, 0.0, 0.2, 1)";
      el.style.transform = `translateX(${flingTo}px) rotate(${flingTo / 20}deg)`;
    }
    // Run the fling animation in parallel with the API. Hold the index
    // advance until BOTH are done — if the API resolves before the 250ms
    // animation, an early setIndex would re-render the top div with the
    // next card's content while it's still under the off-screen fling
    // transform, briefly exposing the peek behind it (visible as a grey
    // flash / strip on swipe). Advance + snap transform together.
    const [, advance] = await Promise.all([
      new Promise<void>((r) => window.setTimeout(r, 250)),
      commitApi(direction).catch(() => false as boolean),
    ]);
    applyCardTransform(0, true);
    if (advance) setIndex((i) => i + 1);
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

  const peek = jobs.slice(index + 1, index + 3);

  return (
    <div className="relative h-full w-full">
      <div className="relative h-full w-full min-h-[460px]">
        {/* Peek cards sit flush behind the top card (no scale / no offset).
            Scaling the peek subpixel-renders pills + text at 0.97x and
            visibly snaps to 1.0x the moment it becomes the top, which is
            what reads as "jumpy" / "distorted pills" / "back card not
            fully loaded". Flat-stacking eliminates the transition. */}
        {peek.map((j) => (
          <div
            key={j.projectId}
            aria-hidden
            className="absolute inset-0"
            style={{ zIndex: 1 }}
          >
            <JobCard data={j} />
          </div>
        ))}

        {/* Top (draggable) card */}
        <div
          ref={cardRef}
          data-testid="job-swipe-top-card"
          onPointerDown={flipped ? undefined : onPointerDown}
          onPointerMove={flipped ? undefined : onPointerMove}
          onPointerUp={flipped ? undefined : onPointerUp}
          onPointerCancel={flipped ? undefined : onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="absolute inset-0 z-10 touch-none select-none will-change-transform"
          style={{
            perspective: "1200px",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
          } as React.CSSProperties}
        >
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: "preserve-3d",
              transition: "transform 0.55s cubic-bezier(0.4, 0.0, 0.2, 1)",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front. translateZ(0) forces this face into its own 3D
                layer; without it Safari leaks the absolutely-positioned
                badges (z-10 inside JobCard) through the rotated face,
                appearing mirrored on the back of the card. */}
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "translateZ(0)",
              }}
            >
              <JobCard data={current} />
            </div>
            {/* Back */}
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg) translateZ(0)",
              }}
            >
              <JobCardBack data={current} />
            </div>
          </div>
        </div>

        {/* Floating action bar — sits absolute over the bottom of the
            top card, glass-blur backdrop. Emerald Like for the trade
            brand. */}
        <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <SwipeActionBar
              tone="emerald"
              disabled={busy}
              onPass={() => commit("left")}
              onInfo={() => setFlipped((v) => !v)}
              onLike={() => commit("right")}
              floating
            />
          </div>
        </div>
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
