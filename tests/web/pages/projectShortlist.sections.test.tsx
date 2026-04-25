// tests/web/pages/projectShortlist.sections.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const get = vi.fn(async (url: string) => {
  if (url.includes("/api/tradesmen/me")) {
    return { data: { role: "homeowner", profile: null } };
  }
  if (url.match(/\/api\/projects\/\d+$/)) {
    return {
      data: { project: { id: 1, name: "Kitchen", ownerUserId: "ho1" } },
    };
  }
  if (url.includes("match-rows")) {
    return {
      data: {
        matches: [
          {
            matchId: "m1",
            builderFirstName: "Mike",
            companyName: "BP",
            trades: ["Building"],
            source: "recommended",
            status: "new",
            whyMatch: "Free",
          },
        ],
      },
    };
  }
  if (url.includes("/matches")) {
    return { data: { recommended: [], subscribed: [] } };
  }
  if (url.includes("/hires")) {
    return { data: { items: [] } };
  }
  return { data: {} };
});

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post: vi.fn() }) }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "ho1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { id: "p1" },
    isReady: true,
    pathname: "/projects/[id]/shortlist",
    asPath: "/projects/p1/shortlist",
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

describe("Shortlist page sections", () => {
  it("renders MatchesList", async () => {
    render(<ShortlistPage />);
    await waitFor(() =>
      expect(screen.getByText("Mike")).toBeInTheDocument(),
    );
  });
});
