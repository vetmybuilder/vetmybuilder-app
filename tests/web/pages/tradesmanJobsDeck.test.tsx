// tests/web/pages/tradesmanJobsDeck.spec.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- API mock ----
const get = vi.fn();
const post = vi.fn(async () => ({
  data: { ok: true, matched: false, projectId: 1 },
}));

vi.mock("@/utils/api", () => ({
  useApi: () => ({ get, post }),
}));

// ---- Auth mock ----
vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "t1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

// ---- Role mock (TradesmanOnly) ----
vi.mock("@/utils/useRole", () => ({
  useRole: () => ({ role: "tradesman", loading: false }),
}));

// ---- Router mock ----
const pushMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/tradesman/jobs",
    asPath: "/tradesman/jobs",
    push: pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

// ---- MobileMenu mock ----
vi.mock("@/utils/mobileMenu", () => ({
  useMobileMenu: () => ({ openMenu: vi.fn(), closeMenu: vi.fn(), open: false }),
}));

// Two mock job items returned from the deck endpoint
const MOCK_JOBS = [
  {
    projectId: 1,
    id: 1,
    title: "Bathroom renovation in E4",
    type: "Bathroom",
    location: "Chingford, E4",
    distanceMiles: 1.2,
    budget: "£5k–£10k",
    propertyType: "Semi-detached",
    bedrooms: 3,
    description: "Full bathroom strip and refit.",
    trades: ["Plumbing", "Tiling"],
    ownerFirstName: "Sarah",
    postedAt: new Date(Date.now() - 3600_000).toISOString(),
    aiScore: 85,
  },
  {
    projectId: 2,
    id: 2,
    title: "Kitchen extension",
    type: "Extension",
    location: "Walthamstow, E17",
    distanceMiles: 3.5,
    budget: "£20k–£30k",
    propertyType: "Terraced",
    bedrooms: 2,
    description: "Single-storey rear extension.",
    trades: ["Building"],
    ownerFirstName: "James",
    postedAt: new Date(Date.now() - 7200_000).toISOString(),
    aiScore: null,
  },
];

import TradesmanJobsDeckPage from "@/pages/tradesman/jobs";

describe("TradesmanJobsDeckPage (swipe deck)", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    pushMock.mockReset();
    post.mockResolvedValue({ data: { ok: true, matched: false, projectId: 1 } });

    // GET /api/tradesmen/jobs?mode=deck → items
    // GET /api/tradesmen/me → profile with trade_types
    get.mockImplementation(async (url: string) => {
      if (url.includes("/api/tradesmen/jobs")) {
        return { data: { items: MOCK_JOBS } };
      }
      if (url.includes("/api/tradesmen/me")) {
        return {
          data: {
            role: "tradesman",
            profile: { trade_types: ["Plumbing", "Tiling"] },
          },
        };
      }
      return { data: {} };
    });
  });

  it("renders the first card title", async () => {
    render(<TradesmanJobsDeckPage />);
    // The card title appears on both front and back faces simultaneously
    // (backface-visibility hidden only applies in browsers, not jsdom).
    await waitFor(() =>
      expect(
        screen.getAllByText(/Bathroom renovation in E4/i).length,
      ).toBeGreaterThan(0),
    );
  });

  it("calls POST with decision:right when the Like button is tapped", async () => {
    render(<TradesmanJobsDeckPage />);

    // Wait for the deck to load
    await waitFor(() =>
      expect(
        screen.getAllByText(/Bathroom renovation in E4/i).length,
      ).toBeGreaterThan(0),
    );

    // Tap the Like button (aria-label="Like" on SwipeActionBar)
    fireEvent.click(screen.getByRole("button", { name: /like/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/tradesmen/jobs/1/swipe",
        { decision: "right" },
      ),
    );
  });
});
