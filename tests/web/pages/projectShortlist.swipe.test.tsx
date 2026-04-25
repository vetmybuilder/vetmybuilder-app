// tests/web/pages/projectShortlist.swipe.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const get = vi.fn(async (url: string) => {
  if (url.includes("/matches")) {
    return {
      data: {
        recommended: [
          {
            uid: "b1",
            displayName: "James H.",
            companyName: "Harrow",
            photoUrl: null,
            starRating: 4.8,
            reviewCount: 27,
            yearsTrading: 12,
            chVerified: true,
            whyMatch: "Covers E4",
            tier: "recommended",
            recommenderName: "Alex",
          },
        ],
        subscribed: [],
      },
    };
  }
  if (url.includes("/api/tradesmen/me")) {
    // Force homeowner path in ShortlistGate
    return { data: { role: "homeowner", profile: null } };
  }
  if (url.match(/\/api\/projects\/\d+$/)) {
    return {
      data: {
        project: { id: 1, name: "Kitchen", ownerUserId: "u1" },
      },
    };
  }
  if (url.includes("/hires")) {
    return { data: { items: [] } };
  }
  return { data: {} };
});

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post: vi.fn() }) }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { id: "1" },
    isReady: true,
    pathname: "/projects/1/shortlist",
    asPath: "/projects/1/shortlist",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Stub helpers that make extra network calls in fetchVmbRatings
vi.mock("@/utils/vmb", () => ({
  fetchVmbRatings: vi.fn(async () => ({ items: [], total: 0 })),
  computeAggregateScore: vi.fn(() => 0),
  normalizedCompanyKey: (s: string) => s.toLowerCase(),
  voteUpRecommendation: vi.fn(),
}));

import ShortlistPage from "@/pages/projects/[id]/shortlist";

describe("Project shortlist page with SwipeDeck", () => {
  it("renders SwipeDeck seeded from /matches response", async () => {
    render(<ShortlistPage />);
    await waitFor(() =>
      expect(screen.getByText("James H.")).toBeInTheDocument(),
    );
  });
});
