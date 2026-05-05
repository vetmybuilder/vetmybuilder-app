// web/components/PhotoLightbox.tsx
//
// Fullscreen carousel lightbox for closure / gallery photos.
//   - Tap a photo on the page → open at that index
//   - Swipe horizontally between photos (drag with momentum threshold)
//   - Counter "n / total" top-left, close X top-right
//   - Dot indicator + thumbnail strip at the bottom (taps jump to a photo)
//   - Dismiss: tap X, swipe down, ESC, or tap dim area outside the photo
//
// Mounts only when open; hides while not in use to avoid stacking pointer
// listeners.

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  open: boolean;
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
};

export default function PhotoLightbox({
  open,
  photos,
  initialIndex = 0,
  onClose,
}: Props) {
  const [index, setIndex] = useState<number>(initialIndex);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Reset index whenever the lightbox (re)opens.
  useEffect(() => {
    if (open) {
      setIndex(Math.max(0, Math.min(initialIndex, photos.length - 1)));
      setDragX(0);
      setDragY(0);
    }
  }, [open, initialIndex, photos.length]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, photos.length]);

  // Keep the active thumbnail visible in the strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-thumb-index="${index}"]`,
    );
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);

  if (!open || photos.length === 0) return null;

  const total = photos.length;
  const current = photos[index];

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    setDragX(e.clientX - dragStart.current.x);
    setDragY(Math.max(0, e.clientY - dragStart.current.y));
  }
  function onPointerUp() {
    const dx = dragX;
    const dy = dragY;
    dragStart.current = null;
    setDragX(0);
    setDragY(0);

    // Vertical swipe down dismisses.
    if (dy > 100 && Math.abs(dx) < 60) {
      onClose();
      return;
    }
    // Horizontal swipe paginates.
    if (Math.abs(dx) > 60) {
      if (dx < 0) setIndex((i) => Math.min(i + 1, total - 1));
      else setIndex((i) => Math.max(i - 1, 0));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[60] flex flex-col"
      style={{
        background: "rgba(0,0,0,0.95)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="photo-lightbox"
    >
      {/* Top bar — counter + close */}
      <div
        className="flex items-center justify-between px-4 pt-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <span
          className="text-[13px] font-bold text-white px-3.5 py-1.5 rounded-full"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(10px)",
          }}
        >
          {index + 1} / {total}
        </span>
        <button
          type="button"
          aria-label="Close photo viewer"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(10px)",
          }}
          data-testid="lightbox-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Photo area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Tap dim area to dismiss (only when not dragging) */}
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            if (!dragStart.current) onClose();
          }}
          className="absolute inset-0 cursor-default"
          tabIndex={-1}
        />

        {/* Active photo, transformed by current drag */}
        <div
          className="relative"
          style={{
            transform: `translate(${dragX}px, ${dragY}px)`,
            transition: dragStart.current ? "none" : "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)",
            opacity: dragY > 0 ? Math.max(0.4, 1 - dragY / 400) : 1,
          }}
        >
          <img
            src={current}
            alt={`Photo ${index + 1} of ${total}`}
            className="max-w-[92vw] max-h-[68vh] block select-none pointer-events-none"
            draggable={false}
          />
        </div>

        {/* Edge nav buttons (also useful on desktop / tablet) */}
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-30"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(10px)",
              }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
              disabled={index === total - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-30"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(10px)",
              }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Dot indicator */}
      {total > 1 && (
        <div className="flex justify-center gap-1.5 pb-1.5 pt-1">
          {photos.map((_, i) => (
            <span
              key={i}
              className={`block h-1.5 rounded-full transition-all ${
                i === index ? "bg-white w-4" : "bg-white/35 w-1.5"
              }`}
            />
          ))}
        </div>
      )}

      {/* Thumbnail strip */}
      {total > 1 && (
        <div
          ref={stripRef}
          className="flex gap-2 overflow-x-auto px-4 pb-2"
          style={{
            paddingBottom: "max(14px, env(safe-area-inset-bottom))",
            scrollbarWidth: "none",
          }}
        >
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              data-thumb-index={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={`relative w-14 h-14 rounded-[10px] bg-cover bg-center shrink-0 transition-all ${
                i === index
                  ? "opacity-100 ring-2 ring-white"
                  : "opacity-50 ring-2 ring-transparent"
              }`}
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
