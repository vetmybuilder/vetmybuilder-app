import { Eye, ThumbsDown, Wrench } from "lucide-react";

// Swipe-deck action bar - builder-themed icons so the screen doesn't
// feel like a dating app. Wrench = trade tool / "let's get to work"
// (yes/right swipe), ThumbsDown = neutral verdict (no/left swipe),
// Eye = "view details" (flips the card).
//
// `tone` controls the Like button colour. Default is indigo (matches
// the homeowner project deck where the viewer is shortlisting builders);
// emerald is used on the tradesman jobs deck so it sits on-brand
// against the rest of the trade-side green chrome.
export default function SwipeActionBar({
  onPass,
  onInfo,
  onLike,
  disabled,
  tone = "indigo",
}: {
  onPass: () => void;
  onInfo: () => void;
  onLike: () => void;
  disabled?: boolean;
  tone?: "indigo" | "emerald";
}) {
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
        <Eye size={22} />
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
