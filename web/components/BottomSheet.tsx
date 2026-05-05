// web/components/BottomSheet.tsx
//
// Reusable iOS-style bottom-sheet shell.
// - Slide up on open, slide down on close
// - Drag-down dismiss (>= 25% of height OR >= 80px)
// - ESC closes
// - Backdrop click closes
// - Mounts only when needed (returns null when fully closed)
//
// Mirrors the pattern used in ShareProjectModal so behaviour stays consistent.

import { useEffect, useRef, useState } from "react";

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Optional ARIA label for the dialog */
  ariaLabel?: string;
  /** Sheet contents */
  children: React.ReactNode;
  /** Optional max-width class override (defaults to max-w-md) */
  maxWidthClassName?: string;
  /** Optional test id on the sheet root (the slide-up panel) */
  sheetTestId?: string;
};

export default function BottomSheet({
  open,
  onClose,
  ariaLabel = "Bottom sheet",
  children,
  maxWidthClassName = "max-w-md",
  sheetTestId,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Mount + transition orchestration.
  useEffect(() => {
    if (open) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
    setEntered(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const dy = e.clientY - dragStartY.current;
    if (dy > 0) setDragY(dy);
  }
  function onPointerUp() {
    const height = sheetRef.current?.offsetHeight ?? 400;
    if (dragY > Math.max(80, height * 0.25)) {
      onClose();
    }
    setDragY(0);
    dragStartY.current = null;
  }

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: entered ? 1 : 0 }}
      />

      <div
        ref={sheetRef}
        data-testid={sheetTestId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative w-full ${maxWidthClassName} bg-white rounded-t-[28px] overflow-hidden touch-none`}
        style={{
          boxShadow: "0 -10px 40px rgba(0,0,0,0.15)",
          transform:
            dragY > 0
              ? `translateY(${dragY}px)`
              : `translateY(${entered ? "0%" : "100%"})`,
          transition:
            dragY > 0
              ? "none"
              : "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2.5 pb-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {children}
      </div>
    </div>
  );
}
