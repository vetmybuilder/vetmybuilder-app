import { useState, useRef } from "react";
import { useApi } from "@/utils/api";
import BuilderCard, { BuilderCardBuilder } from "./BuilderCard";
import SwipeActionBar from "./SwipeActionBar";

export interface SwipeDeckBuilder extends BuilderCardBuilder {
  source?: "recommended" | "subscribed";
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
    return (
      <div className="p-8 text-center text-gray-500">
        No new builders right now — we'll notify you as new matches come in.
      </div>
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
