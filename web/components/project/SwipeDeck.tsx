import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import BuilderCard, { BuilderCardBuilder } from "./BuilderCard";
import BuilderCardBack from "./BuilderCardBack";
import SwipeActionBar from "./SwipeActionBar";
import ShareProjectModal from "./ShareProjectModal";

export interface SwipeDeckBuilder extends BuilderCardBuilder {
  source?: "recommended" | "subscribed";
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
  onInfo,
  onInfoPrefetch,
}: {
  projectId: string;
  builders: SwipeDeckBuilder[];
  onMatch: (builderUid: string) => void;
  onInfo?: (builder: SwipeDeckBuilder) => void;
  /**
   * Optional: called whenever the top card changes. Lets the parent prefetch
   * the route the Info button would navigate to so the page is already in the
   * Next.js router cache by the time the user actually taps it.
   */
  onInfoPrefetch?: (builder: SwipeDeckBuilder) => void;
}) {
  const api = useApi();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const current = builders[index];

  // Reset the flip state whenever the top card changes — a freshly revealed
  // card should always start front-facing.
  useEffect(() => {
    setFlipped(false);
  }, [index]);

  // Kick off a prefetch for the current card's info target the moment it
  // becomes the top of the deck. By the time the homeowner taps "i", the
  // route bundle is already loaded — the navigation feels instant.
  useEffect(() => {
    if (!current || !onInfoPrefetch) return;
    onInfoPrefetch(current);
  }, [current, onInfoPrefetch]);

  async function commit(direction: "left" | "right") {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (current.isRecommendation && current.recommendationId) {
        // Rec card — dismiss from deck. No swipe-interest recorded; the
        // homeowner has already implicitly endorsed via the friend's rec.
        await api.post(`/api/recommendations/${current.recommendationId}/dismiss-from-deck`);
      } else {
        const source = current.tier === "recommended" ? "recommended" : "subscribed";
        const res = await api.post(`/api/projects/${projectId}/swipe`, {
          builderUid: current.uid,
          direction,
          source,
        });
        if (direction === "right" && res.data?.status === "matched") {
          onMatch(current.uid);
        }
      }
      setIndex(i => i + 1);
    } finally {
      setBusy(false);
    }
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
    // Differentiate "freshly posted, no candidates yet" from "you've
    // swiped through every candidate". If the array is empty from the
    // start, it's the former; otherwise the user worked through it.
    return (
      <SwipeDeckEmpty
        projectId={projectId}
        noBuildersYet={builders.length === 0}
      />
    );
  }

  const peek = builders.slice(index + 1, index + 3);

  return (
    <div className="relative">
      <div className="relative h-[520px]">
        {peek.map((b, i) => (
          <div
            key={b.uid}
            aria-hidden
            className="absolute inset-0 transition-transform"
            style={{
              transform: `translateY(${(i + 1) * 8}px) scale(${1 - (i + 1) * 0.03})`,
              zIndex: 1,
            }}
          >
            <BuilderCard builder={b} />
          </div>
        ))}
        <div
          ref={cardRef}
          data-testid="swipe-top-card"
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
            <div
              className="absolute inset-0"
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
            >
              <BuilderCard builder={current} onUnfavouriteRec={unfavouriteRec} />
            </div>
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <BuilderCardBack
                builder={current}
                onViewFull={() => onInfo?.(current)}
              />
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
