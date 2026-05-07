import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";

// react-tinder-card pulls in @react-spring/web, which is ESM-only and
// chokes in vitest's jsdom environment. Replace it with a minimal stub
// that wraps the children, exposes the imperative swipe()/restoreCard()
// API the SwipeDeck calls into, and synthesises the same onSwipe →
// onCardLeftScreen lifecycle a real swipe would fire.
vi.mock("react-tinder-card", () => {
  const TinderCardStub = React.forwardRef<unknown, any>(
    ({ children, onSwipe, onCardLeftScreen, className }, ref) => {
      React.useImperativeHandle(ref, () => ({
        swipe: async (direction: "left" | "right" | "up" | "down" = "right") => {
          onSwipe?.(direction);
          onCardLeftScreen?.(direction);
        },
        restoreCard: async () => {},
      }));
      return React.createElement("div", { className }, children);
    },
  );
  return { __esModule: true, default: TinderCardStub };
});

import SwipeDeck from "@/components/project/SwipeDeck";

const post = vi.fn(async () => ({ data: { status: "pending" } }));
vi.mock("@/utils/api", () => ({
  useApi: () => ({ post, get: vi.fn() }),
}));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, isReady: true, push: vi.fn(), back: vi.fn() }),
}));

const builders = [
  { uid: "b1", displayName: "James H.", companyName: "Harrow", photoUrl: null,
    starRating: 4.8, reviewCount: 27, yearsTrading: 12, chVerified: true,
    whyMatch: "Covers E4", tier: "recommended" as const, recommenderName: "Alex" },
  { uid: "b2", displayName: "Mike B.", companyName: "BP", photoUrl: null,
    starRating: 4.6, reviewCount: 14, yearsTrading: 8, chVerified: true,
    whyMatch: "Kitchen specialist", tier: "ai-matched" as const },
];

describe("SwipeDeck", () => {
  beforeEach(() => post.mockClear());

  it("renders the top card and advances after Like", async () => {
    render(<SwipeDeck projectId="p1" builders={builders} onMatch={() => {}} />);
    // Each card now has both a front face and a back face (flip-card
    // overhaul) so "Harrow" appears in two places. Asserting at least
    // one is enough to confirm the top card is the Harrow row.
    expect(screen.getAllByText("Harrow").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /like/i }));
    await waitFor(() =>
      expect(screen.getAllByText("BP").length).toBeGreaterThan(0),
    );
    expect(post).toHaveBeenCalledWith("/api/projects/p1/swipe",
      { builderUid: "b1", direction: "right", source: "recommended" });
  });

  it("shows empty state when deck runs out", async () => {
    render(<SwipeDeck projectId="p1" builders={[builders[0]]} onMatch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /pass/i }));
    await waitFor(() =>
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith("/api/projects/p1/swipe",
      { builderUid: "b1", direction: "left", source: "recommended" });
  });
});
