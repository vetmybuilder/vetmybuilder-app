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
});
