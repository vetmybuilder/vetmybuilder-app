import { ThumbsDown, Wrench } from "lucide-react";

// Swipe-deck action bar — builder-themed icons so the screen doesn't
// feel like a dating app. Wrench = trade tool / "let's get to work"
// (yes/right swipe), ThumbsDown = neutral verdict (no/left swipe).
// The middle "info" button uses an editorial serif lowercase "i" rather
// than an icon — feels less utilitarian, fits better with the indigo
// brand voice.
export default function SwipeActionBar({
  onPass,
  onInfo,
  onLike,
  disabled,
}: {
  onPass: () => void;
  onInfo: () => void;
  onLike: () => void;
  disabled?: boolean;
}) {
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
        aria-label="Info"
        disabled={disabled}
        onClick={onInfo}
        className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
      >
        <span
          aria-hidden
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontWeight: 800,
            fontSize: 24,
            lineHeight: 1,
          }}
        >
          i
        </span>
      </button>
      <button
        aria-label="Like"
        disabled={disabled}
        onClick={onLike}
        className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 active:scale-95 transition-transform disabled:opacity-40"
      >
        <Wrench size={22} />
      </button>
    </div>
  );
}
