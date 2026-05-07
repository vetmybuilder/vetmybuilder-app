import { Info, ThumbsDown, Wrench } from "lucide-react";

// Swipe-deck action bar — builder-themed icons so the screen doesn't
// feel like a dating app.
//
// Two modes:
//   - default (`floating={false}`): a simple inline row of buttons. Used
//     historically below the deck.
//   - `floating`: a Tinder-style row that sits absolute over the bottom
//     of the photo. Bigger circular buttons, white shadow, glass backdrop.
//
// `tone` controls the Like button colour. Default is indigo (homeowner
// project deck); emerald is used on the tradesman jobs deck.
export default function SwipeActionBar({
  onPass,
  onInfo,
  onLike,
  disabled,
  tone = "indigo",
  floating = false,
}: {
  onPass: () => void;
  onInfo: () => void;
  onLike: () => void;
  disabled?: boolean;
  tone?: "indigo" | "emerald";
  floating?: boolean;
}) {
  const likeBg =
    tone === "emerald"
      ? "linear-gradient(135deg,#10b981,#059669)"
      : "linear-gradient(135deg,#6366f1,#4f46e5)";
  const likeShadowColor =
    tone === "emerald" ? "rgba(16,185,129,0.55)" : "rgba(99,102,241,0.55)";

  if (floating) {
    return (
      <div className="flex items-center justify-center gap-5">
        <button
          aria-label="Pass"
          disabled={disabled}
          onClick={onPass}
          className="w-16 h-16 rounded-full bg-white/95 backdrop-blur shadow-2xl flex items-center justify-center text-rose-500 active:scale-95 transition-transform disabled:opacity-40"
        >
          <ThumbsDown size={26} strokeWidth={2.4} />
        </button>
        <button
          aria-label="View details"
          disabled={disabled}
          onClick={onInfo}
          className="w-12 h-12 rounded-full bg-white/85 backdrop-blur shadow-xl flex items-center justify-center text-slate-700 active:scale-95 transition-transform disabled:opacity-40"
        >
          <Info size={22} strokeWidth={2.4} />
        </button>
        <button
          aria-label="Like"
          disabled={disabled}
          onClick={onLike}
          className="w-16 h-16 rounded-full text-white shadow-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          style={{
            background: likeBg,
            boxShadow: `0 14px 32px ${likeShadowColor}`,
          }}
        >
          <Wrench size={26} strokeWidth={2.4} />
        </button>
      </div>
    );
  }

  const likeClasses =
    tone === "emerald"
      ? "bg-emerald-600 shadow-emerald-600/30"
      : "bg-indigo-600 shadow-indigo-600/30";

  return (
    <div className="flex items-center justify-center gap-5 py-4">
      <button
        aria-label="Pass"
        disabled={disabled}
        onClick={onPass}
        className="w-14 h-14 rounded-full border-2 border-red-300 text-red-500 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
      >
        <ThumbsDown size={22} />
      </button>
      <button
        aria-label="View details"
        disabled={disabled}
        onClick={onInfo}
        className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
      >
        <Info size={22} strokeWidth={2.4} />
      </button>
      <button
        aria-label="Like"
        disabled={disabled}
        onClick={onLike}
        className={`w-14 h-14 rounded-full text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-40 ${likeClasses}`}
      >
        <Wrench size={22} />
      </button>
    </div>
  );
}
