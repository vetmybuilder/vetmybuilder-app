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
  noJobsYet = false,
}: {
  jobs: JobCardData[];
  /** Called after every swipe so the parent can track remaining count. */
  onConsumed?: () => void;
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

  async function commit(direction: "left" | "right") {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await api.post(
        `/api/tradesmen/jobs/${current.projectId}/swipe`,
        { decision: direction === "right" ? "right" : "left" },
      );
      if (direction === "right" && res.data?.matched) {
        router.push(`/match/${current.projectId}`);
        return; // navigation handles unmount
      }
      setIndex((i) => i + 1);
      onConsumed?.();
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
        return;
      }
      // Any other error - swallow rather than crash the deck. The card
      // stays in place; the user can retry.
    } finally {
      setBusy(false);
    }
  }

  // ---- drag state ----
  const [drag, setDrag] = useState({ dx: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    dragStartX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartX.current === null) return;
    setDrag({ dx: e.clientX - dragStartX.current });
  }
  function onPointerUp() {
    const width = cardRef.current?.offsetWidth ?? 320;
    const { dx } = drag;
    if (Math.abs(dx) / width > 0.25) {
      commit(dx > 0 ? "right" : "left");
    }
    setDrag({ dx: 0 });
    dragStartX.current = null;
  }

  if (!current) {
    return <JobSwipeDeckEmpty noJobsYet={noJobsYet} />;
  }

  const peek = jobs.slice(index + 1, index + 3);

  return (
    <div className="relative">
      <div className="relative h-[520px]">
        {/* Peek cards — static stack hint */}
        {peek.map((j, i) => (
          <div
            key={j.projectId}
            aria-hidden
            className="absolute inset-0 transition-transform"
            style={{
              transform: `translateY(${(i + 1) * 8}px) scale(${1 - (i + 1) * 0.03})`,
              zIndex: 1,
            }}
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
          className="absolute inset-0 z-10 touch-none"
          style={{
            transform: flipped
              ? "none"
              : `translateX(${drag.dx}px) rotate(${drag.dx / 20}deg)`,
            perspective: "1200px",
          }}
        >
          <div
            className="relative w-full h-full"
            style={{
              transformStyle: "preserve-3d",
              transition: "transform 0.55s cubic-bezier(0.4, 0.0, 0.2, 1)",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
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
                transform: "rotateY(180deg)",
              }}
            >
              <JobCardBack data={current} />
            </div>
          </div>
        </div>
      </div>

      <SwipeActionBar
        disabled={busy}
        onPass={() => commit("left")}
        onInfo={() => setFlipped((v) => !v)}
        onLike={() => commit("right")}
      />

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
