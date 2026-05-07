import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";

// See SwipeDeck.test.tsx for why we stub react-tinder-card. The stub's
// imperative swipe() fires onSwipe + onCardLeftScreen so the deck's
// lifecycle (commit API → advance index) runs identically to a real
// drag-driven swipe.
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
vi.mock("@/utils/api", () => ({ useApi: () => ({ post, get: vi.fn() }) }));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, isReady: true, push: vi.fn(), back: vi.fn() }),
}));

const builder = {
  uid: "b1", displayName: "James H.", companyName: "Harrow", photoUrl: null,
  starRating: 4.8, reviewCount: 27, yearsTrading: 12, chVerified: true,
  whyMatch: "Covers E4", tier: "recommended" as const, recommenderName: "Alex",
};

describe("SwipeDeck swipe commit", () => {
  beforeEach(() => post.mockClear());

  // Real drag gestures run through react-tinder-card's spring-driven
  // physics, which can't be exercised in jsdom (no real pointer events,
  // no @react-spring frame loop). We verify the same flingAndCommit
  // path via the action bar Like button - it calls the library's
  // imperative swipe(), which the stub maps to onSwipe + onCardLeftScreen.
  it("Like button commits a right swipe with the recommended source", async () => {
    render(<SwipeDeck projectId="p1" builders={[builder]} onMatch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Like$/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/projects/p1/swipe",
        expect.objectContaining({
          direction: "right",
          source: "recommended",
          builderUid: "b1",
        }),
      ),
    );
  });
});
