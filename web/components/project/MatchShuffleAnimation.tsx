// web/components/project/MatchShuffleAnimation.tsx
//
// Loading affordance shown after the homeowner finishes the post-a-job
// wizard. A circular face frame cycles through tradesperson "faces"
// fast at first then decelerates, mimicking a search settling on a
// shortlist. Calls onSettled when the last interval fires so the parent
// can swap to the matches reveal.
//
// Placeholder initials today; real tradesperson profile photos slot in
// later via the `faces` prop.

import { useEffect, useRef, useState } from "react";

export type ShuffleFace = {
  initial: string;
  /** Gradient start colour. Used as the fallback when photoUrl is unset. */
  from: string;
  /** Gradient end colour. */
  to: string;
  /** Real tradesperson photo. When set, the cycled frame renders this image
   *  instead of the initial/gradient fallback. */
  photoUrl?: string | null;
};

const DEFAULT_FACES: ShuffleFace[] = [
  { initial: "P", from: "#a78bfa", to: "#7c3aed" },
  { initial: "S", from: "#fb923c", to: "#ea580c" },
  { initial: "T", from: "#34d399", to: "#059669" },
  { initial: "H", from: "#60a5fa", to: "#2563eb" },
  { initial: "W", from: "#f472b6", to: "#db2777" },
  { initial: "R", from: "#ef4444", to: "#b91c1c" },
  { initial: "J", from: "#06b6d4", to: "#0e7490" },
  { initial: "M", from: "#facc15", to: "#ca8a04" },
];

// Decelerating intervals (ms). Tuned so the loop feels like a slot
// machine: ~60ms gaps for the first half-second, easing out to ~1.5s
// by the time the last face lands. Total run ~9s.
const INTERVALS_MS = [
  60, 60, 60, 60, 70, 80, 90, 105, 125, 150, 180, 215, 255, 305, 365, 435,
  520, 625, 750, 900, 1080, 1300, 1560,
];

const TOTAL_SHUFFLE_MS = INTERVALS_MS.reduce((sum, ms) => sum + ms, 0);

interface Props {
  /** When true, the shuffle starts. Going false resets the animation. */
  active: boolean;
  /** Fires once after the final interval. */
  onSettled?: () => void;
  /** Optional override for the cycling faces (e.g. real preview matches). */
  faces?: ShuffleFace[];
}

export default function MatchShuffleAnimation({
  active,
  onSettled,
  faces = DEFAULT_FACES,
}: Props) {
  const [currentFace, setCurrentFace] = useState(0);
  const [phase, setPhase] = useState<"running" | "settled">("running");
  // Drives the mobile progress bar: false on mount so the bar's width
  // starts at 0%, flipped to true on the next animation frame so the
  // CSS width transition (duration = TOTAL_SHUFFLE_MS) actually runs
  // from 0 → 100 instead of jumping there.
  const [progressArmed, setProgressArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold onSettled in a ref so changing the callback between renders
  // doesn't restart the shuffle (only `active` should drive that).
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  // Hold faces in a ref so the cycle's `face = (face + 1) % faces.length`
  // reads the LATEST faces array without forcing the effect (and the
  // shuffle animation) to restart when previewMatches arrives mid-shuffle.
  // Without this the photo swap would jolt the animation back to its
  // initial step.
  const facesRef = useRef(faces);
  useEffect(() => {
    facesRef.current = faces;
  }, [faces]);

  useEffect(() => {
    if (!active) {
      setProgressArmed(false);
      return;
    }
    setPhase("running");
    setCurrentFace(0);
    setProgressArmed(false);
    // requestAnimationFrame gives React a paint with width=0 BEFORE the
    // transition kicks off so it actually animates (vs. snapping).
    const raf = requestAnimationFrame(() => setProgressArmed(true));
    let stepIndex = 0;
    let face = 0;

    function tick() {
      setCurrentFace(face);
      face = (face + 1) % Math.max(1, facesRef.current.length);
      if (stepIndex >= INTERVALS_MS.length) {
        setPhase("settled");
        onSettledRef.current?.();
        return;
      }
      timerRef.current = setTimeout(tick, INTERVALS_MS[stepIndex++]);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active]);

  return (
    <div
      className="min-h-[320px] relative flex flex-col items-center justify-center gap-7"
      data-testid="match-shuffle"
    >
      <div
        className={`relative w-60 h-60 rounded-full overflow-hidden bg-slate-100 transition-all duration-500 ${
          phase === "settled" ? "opacity-0 scale-90" : "opacity-100 scale-100"
        }`}
        style={{
          border: "6px solid white",
          boxShadow: "0 18px 48px rgba(0,0,0,0.14)",
        }}
      >
        {faces.map((face, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 flex items-center justify-center text-white font-black transition-opacity duration-75 ${
              idx === currentFace ? "opacity-100" : "opacity-0"
            }`}
            style={{
              fontSize: 96,
              backgroundImage: face.photoUrl
                ? `url(${face.photoUrl})`
                : `linear-gradient(135deg, ${face.from}, ${face.to})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            aria-hidden
          >
            {face.photoUrl ? null : face.initial}
          </div>
        ))}
        {/* Scanner sweep. Width = 40% of frame; keyframe drives left
            from -40% to 100% so the highlight passes fully across. */}
        <div
          className="absolute top-0 bottom-0 z-10 pointer-events-none animate-match-shuffle-sweep"
          style={{
            width: "40%",
            background:
              "linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)",
          }}
        />
      </div>

      {/* Mobile-only progress bar. The width transitions from 0 -> 100%
          over exactly TOTAL_SHUFFLE_MS so it lands at full bar at the
          same moment the face stops cycling. Desktop hides this (the
          face frame itself reads as the "progress" cue on a big
          viewport). */}
      <div
        className={`md:hidden mx-auto w-64 max-w-[80%] transition-opacity duration-300 ${
          phase === "settled" ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      >
        <div className="h-1.5 rounded-full bg-indigo-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: progressArmed ? "100%" : "0%",
              background: "linear-gradient(90deg, #6366f1, #4f46e5)",
              transition: `width ${TOTAL_SHUFFLE_MS}ms linear`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
