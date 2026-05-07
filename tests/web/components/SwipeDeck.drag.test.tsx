import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("SwipeDeck drag gestures", () => {
  beforeEach(() => post.mockClear());

  it("commits right swipe when dragged past 25% threshold", async () => {
    render(<SwipeDeck projectId="p1" builders={[builder]} onMatch={() => {}} />);
    const card = screen.getByTestId("swipe-top-card");

    Object.defineProperty(card, "offsetWidth", { value: 320, configurable: true });
    fireEvent.pointerDown(card, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 120, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 120, clientY: 0, pointerId: 1 });

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/projects/p1/swipe",
        expect.objectContaining({ direction: "right" })),
    );
  });
});
