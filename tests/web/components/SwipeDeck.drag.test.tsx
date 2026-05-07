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

describe("SwipeDeck swipe commit", () => {
  beforeEach(() => post.mockClear());

  // Pointer-drag gestures are owned by framer-motion's drag system, which
  // doesn't reliably activate inside jsdom (Pointer Events API + layout
  // measurements stubbed out). We exercise the same commit path via the
  // action bar Like button - both call flingAndCommit, so this catches
  // any regression in the API call shape, body, and source tag.
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
