import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    expect(screen.getByText("Harrow")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /like/i }));
    await waitFor(() => expect(screen.getByText("BP")).toBeInTheDocument());
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
