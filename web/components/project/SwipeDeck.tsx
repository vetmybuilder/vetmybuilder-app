import { useState, useRef } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import BuilderCard, { BuilderCardBuilder } from "./BuilderCard";
import SwipeActionBar from "./SwipeActionBar";
import ShareProjectModal from "./ShareProjectModal";

export interface SwipeDeckBuilder extends BuilderCardBuilder {
  source?: "recommended" | "subscribed";
  recommendationId?: string | number | null;
}

export default function SwipeDeck({
  projectId,
  builders,
  onMatch,
  onInfo,
}: {
  projectId: string;
  builders: SwipeDeckBuilder[];
  onMatch: (builderUid: string) => void;
  onInfo?: (builder: SwipeDeckBuilder) => void;
}) {
  const api = useApi();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = builders[index];

  async function commit(direction: "left" | "right") {
    if (!current || busy) return;
    setBusy(true);
    const source = current.tier === "recommended" ? "recommended" : "subscribed";
    try {
      const res = await api.post(`/api/projects/${projectId}/swipe`, {
        builderUid: current.uid,
        direction,
        source,
      });
      if (direction === "right" && res.data?.status === "matched") {
        onMatch(current.uid);
      }
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
    return <SwipeDeckEmpty projectId={projectId} />;
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute inset-0 z-10 touch-none"
          style={{
            transform: `translateX(${drag.dx}px) rotate(${drag.dx / 20}deg)`,
          }}
        >
          <BuilderCard builder={current} />
        </div>
      </div>
      <SwipeActionBar
        disabled={busy}
        onPass={() => commit("left")}
        onInfo={() => onInfo?.(current)}
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

function SwipeDeckEmpty({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);

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
        <span className="text-white text-[44px] leading-none font-bold">✓</span>
      </div>

      <h2 className="relative text-[26px] font-extrabold tracking-[-0.02em] leading-[1.2] text-gray-900">
        You're all caught up
      </h2>
      <p className="relative mt-2.5 text-[14px] text-gray-500 leading-[1.5] max-w-[290px]">
        You've swiped through every builder we have for this project. We'll ping you the moment a new match comes in.
      </p>

      <div className="relative mt-7 w-full max-w-[320px] flex flex-col gap-2.5">
        <button
          onClick={() => router.push("/matches")}
          className="flex items-center justify-center gap-2 py-4 px-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_10px_24px_rgba(99,102,241,0.3)]"
        >
          See your matches
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center justify-center gap-2 py-4 px-5 rounded-2xl bg-white border-[1.5px] border-gray-200 text-gray-700 font-extrabold text-[15px] tracking-tight"
        >
          Share project to find more
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
