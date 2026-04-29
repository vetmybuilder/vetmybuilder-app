// tests/web/pages/tradesmanJobsList.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- API mock ----
const get = vi.fn();

vi.mock("@/utils/api", () => ({
  useApi: () => ({ get }),
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
    pathname: "/tradesman/jobs/list",
    asPath: "/tradesman/jobs/list",
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

// ── Mock data ──────────────────────────────────────────────────────────────

// Builder's one trade type is "Plumbing"
const MOCK_ME = {
  role: "tradesman",
  profile: { trade_types: ["Plumbing"] },
};

// Three jobs: high AI score (90), mid score (75), low score (30 — should be dimmed)
const MOCK_JOBS = [
  {
    projectId: 101,
    id: 101,
    title: "Bathroom renovation in E4",
    type: "Plumbing",
    location: "Chingford, E4",
    budget: "£5k–£10k",
    propertyType: "Semi-detached",
    bedrooms: 3,
    trades: ["Plumbing", "Tiling"],
    postedAt: new Date(Date.now() - 3_600_000).toISOString(), // 1h ago
    aiScore: 90,
  },
  {
    projectId: 102,
    id: 102,
    title: "Kitchen extension rear",
    type: "Building",
    location: "Walthamstow, E17",
    budget: "£30k–£60k",
    propertyType: "Terraced",
    bedrooms: 4,
    trades: ["Building", "Plumbing"],
    postedAt: new Date(Date.now() - 7_200_000).toISOString(), // 2h ago
    aiScore: 75,
  },
  {
    projectId: 103,
    id: 103,
    title: "Garden fence replacement",
    type: "Landscaping",
    location: "Leyton, E10",
    budget: "Under £5k",
    propertyType: null,
    bedrooms: null,
    trades: ["Landscaping"],
    postedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), // 3 days ago
    aiScore: 30,
  },
];

import TradesmanJobsListPage from "@/pages/tradesman/jobs/list";

describe("TradesmanJobsListPage (browse list)", () => {
  beforeEach(() => {
    get.mockReset();
    pushMock.mockReset();

    get.mockImplementation(async (url: string) => {
      if (url.includes("/api/tradesmen/jobs")) {
        return { data: { items: MOCK_JOBS } };
      }
      if (url.includes("/api/tradesmen/me")) {
        return { data: MOCK_ME };
      }
      return { data: {} };
    });
  });

  it("renders all 3 job rows after loading", async () => {
    render(<TradesmanJobsListPage />);

    await waitFor(() =>
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy(),
    );
    expect(screen.getByTestId("job-list-row-102")).toBeTruthy();
    expect(screen.getByTestId("job-list-row-103")).toBeTruthy();
  });

  it("applies opacity-65 class to the low-score row (aiScore 30)", async () => {
    render(<TradesmanJobsListPage />);

    await waitFor(() =>
      expect(screen.getByTestId("job-list-row-103")).toBeTruthy(),
    );

    const lowRow = screen.getByTestId("job-list-row-103");
    expect(lowRow.className).toContain("opacity-65");
  });

  it("does NOT apply opacity-65 to high-score rows", async () => {
    render(<TradesmanJobsListPage />);

    await waitFor(() =>
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy(),
    );

    const highRow = screen.getByTestId("job-list-row-101");
    expect(highRow.className).not.toContain("opacity-65");
  });

  it("filters to My trades — only rows whose trades include Plumbing", async () => {
    render(<TradesmanJobsListPage />);

    // Wait for rows to appear under "All"
    await waitFor(() =>
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy(),
    );

    // Tap "My trades" chip
    fireEvent.click(screen.getByTestId("chip-my-trades"));

    // Row 101 (Plumbing) and 102 (Building + Plumbing) should be visible
    await waitFor(() => {
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy();
      expect(screen.getByTestId("job-list-row-102")).toBeTruthy();
    });

    // Row 103 (Landscaping only) should be gone
    expect(screen.queryByTestId("job-list-row-103")).toBeNull();
  });

  it("resets filter to All when All chip is tapped", async () => {
    render(<TradesmanJobsListPage />);

    await waitFor(() =>
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy(),
    );

    // Switch to My trades, then back to All
    fireEvent.click(screen.getByTestId("chip-my-trades"));
    fireEvent.click(screen.getByTestId("chip-all"));

    await waitFor(() => {
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy();
      expect(screen.getByTestId("job-list-row-102")).toBeTruthy();
      expect(screen.getByTestId("job-list-row-103")).toBeTruthy();
    });
  });

  it("NO contact or message button anywhere on the page", async () => {
    render(<TradesmanJobsListPage />);

    await waitFor(() =>
      expect(screen.getByTestId("job-list-row-101")).toBeTruthy(),
    );

    // None of these patterns should exist
    expect(screen.queryByText(/contact/i)).toBeNull();
    expect(screen.queryByText(/message/i)).toBeNull();
    expect(screen.queryByText(/view \/ contact/i)).toBeNull();
  });

  it("Open in deck → navigates to /tradesman/jobs?focus=<id>", async () => {
    render(<TradesmanJobsListPage />);

    await waitFor(() =>
      expect(screen.getByTestId("open-in-deck-101")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("open-in-deck-101"));

    expect(pushMock).toHaveBeenCalledWith("/tradesman/jobs?focus=101");
  });
});
