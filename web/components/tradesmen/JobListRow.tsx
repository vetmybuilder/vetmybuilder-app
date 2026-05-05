// web/components/tradesmen/JobListRow.tsx
//
// Compact list-row card for the /tradesman/jobs/list browse view.
// Pure presentational — no data fetching, no routing (caller passes onOpenInDeck).
// When swipeStateLabel === 'Matched' and matchId is set, the pill navigates to /chat/:matchId.

import Link from "next/link";
import { useRouter } from "next/router";

export interface JobListRowData {
  projectId: number;
  title: string;
  type: string;
  location: string;
  budget?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  trades: string[];
  matchedTrades: string[];
  postedAt: string;
  aiScore?: number | null;
  /** UI label derived from the builder's swipe state — null = not yet engaged. */
  swipeStateLabel?: string | null;
  /** swipe_interest.id — only set when a match exists (status = 'matched'). */
  matchId?: number | null;
}

/** Tone classes for the swipe-state pill, keyed by label. */
function swipePillClass(label: string): string {
  switch (label) {
    case "Matched":
      return "bg-emerald-50 text-emerald-700";
    case "Pending your match":
      return "bg-amber-50 text-amber-800";
    case "Awaiting homeowner":
      return "bg-indigo-50 text-indigo-700";
    case "You declined":
      return "bg-gray-100 text-gray-500";
    case "Homeowner passed":
      return "bg-gray-100 text-gray-500";
    case "Expired":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Returns a human-readable relative time string like "2h ago", "yesterday", "3 days ago". */
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

const HIGH_BUDGET_PREFIXES = ["£15k", "£30k", "£60k"];

export default function JobListRow({
  data,
  onOpen,
}: {
  data: JobListRowData;
  /** Called when the row is tapped (anywhere except the swipe-state
   *  pill or other interactive children). The list page opens its
   *  bottom sheet from here. Optional - rows still render fine without
   *  it (read-only / legacy callers). */
  onOpen?: (projectId: number) => void;
}) {
  const router = useRouter();
  const isLowScore = (data.aiScore ?? 101) < 60;

  // Build meta segments — drop missing ones
  const metaParts: string[] = [];
  if (data.type) metaParts.push(data.type);
  if (data.location) metaParts.push(data.location);
  if (data.bedrooms != null && data.propertyType) {
    metaParts.push(`${data.bedrooms}-bed ${data.propertyType}`);
  } else if (data.bedrooms != null) {
    metaParts.push(`${data.bedrooms}-bed`);
  } else if (data.propertyType) {
    metaParts.push(data.propertyType);
  }

  // Build pills: budget first, then matched trades (emerald), then unmatched (grey). Cap at 4 total.
  const matchedSet = new Set(data.matchedTrades.map((t) => t.toLowerCase()));
  const matchedPills = data.trades.filter((t) => matchedSet.has(t.toLowerCase()));
  const unmatchedPills = data.trades.filter((t) => !matchedSet.has(t.toLowerCase()));

  const allTradePills = [...matchedPills, ...unmatchedPills];
  const MAX_PILLS = 4; // budget counts as 1
  const budgetSlot = data.budget ? 1 : 0;
  const tradeSlots = MAX_PILLS - budgetSlot;
  const visibleTrades = allTradePills.slice(0, tradeSlots);
  const overflowCount = allTradePills.length - visibleTrades.length;

  const budgetIsHigh =
    data.budget != null &&
    HIGH_BUDGET_PREFIXES.some((p) => data.budget!.startsWith(p));

  function handleOpenInDeck(e: React.MouseEvent) {
    e.preventDefault();
    router.push(`/tradesman/jobs?focus=${data.projectId}`);
  }

  return (
    <article
      className={`bg-white rounded-xl border border-gray-100 p-3${isLowScore ? " opacity-65" : ""}${onOpen ? " cursor-pointer active:bg-gray-50 transition-colors" : ""}`}
      data-testid={`job-list-row-${data.projectId}`}
      onClick={
        onOpen
          ? (e) => {
              // Don't fire when the user clicked an inner button or
              // link (the swipe-state pill, "Open in deck" button, etc).
              const target = e.target as HTMLElement;
              if (target.closest("button, a")) return;
              onOpen(data.projectId);
            }
          : undefined
      }
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(data.projectId);
              }
            }
          : undefined
      }
    >
      {/* Top row: title + AI mini-badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-extrabold text-gray-900 leading-[1.25] flex-1">
          {data.title}
        </h3>
        {data.aiScore != null && data.aiScore >= 60 && (
          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9.5px] font-extrabold">
            ✨ {data.aiScore}%
          </span>
        )}
      </div>

      {/* Meta line */}
      {metaParts.length > 0 && (
        <div className="mt-1 text-[11.5px] text-gray-500 flex flex-wrap gap-x-2">
          {metaParts.map((part, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-300" aria-hidden>·</span>}
              {part}
            </span>
          ))}
        </div>
      )}

      {/* Pill row */}
      {(data.budget || visibleTrades.length > 0 || overflowCount > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {data.budget && (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold${
                isLowScore || !budgetIsHigh
                  ? " bg-gray-100 text-gray-500"
                  : " bg-emerald-50 text-emerald-700"
              }`}
            >
              {data.budget}
            </span>
          )}
          {visibleTrades.map((trade) => {
            const isMatched = matchedSet.has(trade.toLowerCase());
            return (
              <span
                key={trade}
                className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-bold${
                  isMatched
                    ? " bg-emerald-50 text-emerald-700"
                    : " bg-gray-100 text-gray-700"
                }`}
              >
                {trade}
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10.5px] font-bold">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[10.5px] font-bold text-gray-400">
          Posted {relativeTime(data.postedAt)}
        </span>
        {data.swipeStateLabel ? (
          data.swipeStateLabel === "Matched" && data.matchId ? (
            <Link
              href={`/chat/${data.matchId}`}
              className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${swipePillClass(data.swipeStateLabel)}`}
              data-testid={`swipe-state-${data.projectId}`}
            >
              {data.swipeStateLabel} →
            </Link>
          ) : (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${swipePillClass(data.swipeStateLabel)}`}
              data-testid={`swipe-state-${data.projectId}`}
            >
              {data.swipeStateLabel}
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={handleOpenInDeck}
            className="text-[11.5px] font-extrabold text-emerald-700 flex items-center gap-1"
            data-testid={`open-in-deck-${data.projectId}`}
          >
            Open in deck →
          </button>
        )}
      </div>
    </article>
  );
}
