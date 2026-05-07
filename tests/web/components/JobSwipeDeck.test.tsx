// tests/web/components/JobSwipeDeck.test.tsx
//
// Tradesman discovery deck. Wraps JobCard + JobCardBack in a flip-card,
// commits left/right swipes via /api/tradesmen/jobs/:id/swipe, navigates
// to /match/:id on a mutual right-swipe, and opens SwipePayGate when
// the server returns 403 requiresSubscription.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobCardData } from "@/components/tradesmen/JobCard";

const jobs: JobCardData[] = [
  {
    projectId: 7,
    title: "Loft conversion",
    type: "Loft Conversion",
    location: "E4",
    description: "",
    trades: ["Loft Conversion"],
    matchedTrades: ["Loft Conversion"],
    postedAt: "2026-05-04T10:00:00Z",
  },
  {
    projectId: 8,
    title: "Bathroom refit",
    type: "Bathroom",
    location: "E17",
    description: "",
    trades: ["Plumbing"],
    matchedTrades: [],
    postedAt: "2026-05-03T10:00:00Z",
  },
];

const post = vi.fn(async () => ({ data: { matched: false } }));
const apiInstance = { get: vi.fn(), post };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

const push = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push, replace: vi.fn(), pathname: "/tradesman/jobs", query: {} }),
}));

// Stub the paid-unlock gate - it has its own /api/payments fetches and
// is exercised by its own dedicated test file.
vi.mock("@/components/tradesmen/SwipePayGate", () => ({
  default: ({ open, subject }: any) =>
    open ? (
      <div data-testid="stub-paygate">paygate for {subject?.projectId}</div>
    ) : null,
}));

import JobSwipeDeck from "@/components/tradesmen/JobSwipeDeck";

describe("<JobSwipeDeck />", () => {
  beforeEach(() => {
    post.mockReset();
    push.mockClear();
    post.mockResolvedValue({ data: { matched: false } });
  });

  it("Pass commits a left swipe and advances the deck", async () => {
    const onConsumed = vi.fn();
    render(<JobSwipeDeck jobs={jobs} onConsumed={onConsumed} />);
    fireEvent.click(screen.getByRole("button", { name: /pass/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/api/tradesmen/jobs/7/swipe",
        { decision: "left" },
      );
    });
    expect(onConsumed).toHaveBeenCalled();
  });

  it("Like with no match commits a right swipe and stays on the page", async () => {
    render(<JobSwipeDeck jobs={jobs} />);
    fireEvent.click(screen.getByRole("button", { name: /^like$/i }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/api/tradesmen/jobs/7/swipe",
        { decision: "right" },
      );
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("Like with mutual match navigates to /match/:projectId", async () => {
    post.mockResolvedValueOnce({ data: { matched: true } });
    render(<JobSwipeDeck jobs={jobs} />);
    fireEvent.click(screen.getByRole("button", { name: /^like$/i }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/match/7");
    });
  });

  it("opens the pay gate when the server returns 403 requiresSubscription", async () => {
    post.mockRejectedValueOnce({
      response: { status: 403, data: { requiresSubscription: true } },
    });
    render(<JobSwipeDeck jobs={jobs} />);
    fireEvent.click(screen.getByRole("button", { name: /^like$/i }));
    await waitFor(() => {
      expect(screen.getByTestId("stub-paygate")).toBeInTheDocument();
    });
    expect(screen.getByText(/paygate for 7/)).toBeInTheDocument();
  });

  // Regression guards for the swipe-deck visual architecture. The deck
  // relies on these specifics to avoid the bugs we hit:
  //   - paygate stranding the card off-screen,
  //   - peek pills "loading in late" because cards remount on promote,
  //   - parallel-promote not finding peek-1 by data-card-rank.

  it("paygate keeps the same card on top so the user can re-swipe after paying", async () => {
    // Server rejects with paygate. The deck must NOT advance and the
    // top card must still be the original (project 7), not card 8.
    post.mockRejectedValueOnce({
      response: { status: 403, data: { requiresSubscription: true } },
    });
    render(<JobSwipeDeck jobs={jobs} />);
    fireEvent.click(screen.getByRole("button", { name: /^like$/i }));
    await waitFor(() =>
      expect(screen.getByTestId("stub-paygate")).toBeInTheDocument(),
    );
    // Top card still has projectId 7's data-testid - paygate didn't
    // advance the deck.
    expect(screen.getByTestId("job-swipe-top-card")).toBeInTheDocument();
    // And card 8's content (the next job) hasn't taken the top slot.
    expect(screen.getAllByText(/Loft conversion/).length).toBeGreaterThan(0);
  });

  it("renders top + peek cards as siblings in stable DOM (pills pre-painted)", () => {
    // The deck mounts ALL visible cards simultaneously - top + up to
    // three peeks. This is what keeps the next card's image and chips
    // already rendered when it's promoted to top, so there's no
    // "pills load late" flicker. We check by counting cards via the
    // data-card-rank attribute the parallel-promote selector relies on.
    render(<JobSwipeDeck jobs={jobs} />);
    const cards = document.querySelectorAll("[data-card-rank]");
    // 2 jobs in the fixture, so we expect 2 mounted cards (top + 1 peek).
    expect(cards.length).toBe(2);
    expect(cards[0]?.getAttribute("data-card-rank")).toBe("0");
    expect(cards[1]?.getAttribute("data-card-rank")).toBe("1");
  });

  it("peek-1 carries data-card-rank='1' so flingAndCommit can grab it for parallel-promote", () => {
    // The imperative parallel-promote selector
    // `[data-card-rank="1"]` runs inside flingAndCommit during the top
    // card's fly-off. If anyone removes the data attribute or renumbers
    // ranks, the smooth zoom-in regresses to a noticeable jump because
    // the peek's transition only fires after setIndex's re-render -
    // which in jsdom + React 18 is unreliable.
    render(<JobSwipeDeck jobs={jobs} />);
    const peek = document.querySelector('[data-card-rank="1"]');
    expect(peek).not.toBeNull();
  });
});
