// tests/web/pages/matches.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import MatchesPage from "@/pages/matches";

const matches = [
  {
    matchId: "m1",
    projectId: "p1",
    projectTitle: "Kitchen extension",
    builderUid: "b1",
    companyName: "BP Builds",
    photoUrl: null,
    trades: ["Building"],
    yearsTrading: 10,
    googleRating: 4.8,
    googleReviewCount: 120,
    vmbScore: 88,
    chVerified: true,
    likesCount: 21,
    winsCount: 6,
    source: "recommended" as const,
    status: "new" as const,
    whyMatch: "Recommended · Free to contact",
  },
  {
    matchId: "m2",
    projectId: "p1",
    projectTitle: "Kitchen extension",
    builderUid: "b2",
    companyName: "Harrow Construction",
    photoUrl: null,
    trades: ["Building"],
    yearsTrading: 12,
    googleRating: null,
    googleReviewCount: 0,
    vmbScore: 60,
    chVerified: false,
    likesCount: 4,
    winsCount: 1,
    source: "ai-matched" as const,
    status: "new" as const,
    whyMatch: "Matched on area + trade",
  },
  {
    matchId: "m3",
    projectId: "p2",
    projectTitle: "Roof repair",
    builderUid: "b3",
    companyName: "Ridgeway Roofing",
    photoUrl: null,
    trades: ["Roofing"],
    yearsTrading: 8,
    googleRating: 4.2,
    googleReviewCount: 33,
    vmbScore: 70,
    chVerified: true,
    likesCount: 9,
    winsCount: 2,
    source: "ai-matched" as const,
    status: "contacted" as const,
    whyMatch: "Matched on area + trade",
  },
];

const push = vi.fn();
const get = vi.fn(async () => ({
  data: { matches, counts: { new: 2, contacted: 1, archived: 0 } },
}));
vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post: vi.fn() }) }));
vi.mock("@/utils/auth", () => ({ useAuth: () => ({ user: { uid: "ho1" } }) }));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    push,
    back: vi.fn(),
    pathname: "/matches",
    asPath: "/matches",
  }),
}));

describe("MatchesPage", () => {
  beforeEach(() => {
    push.mockClear();
    get.mockClear();
  });

  it("renders hero, tabs, groups, and cards for New tab", async () => {
    render(<MatchesPage />);
    await waitFor(() =>
      expect(screen.getByText(/Your matches/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Recommended by your network/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/AI-matched/i)).toBeInTheDocument();
    expect(screen.getByText("BP Builds")).toBeInTheDocument();
    expect(screen.getByText("Harrow Construction")).toBeInTheDocument();
    expect(screen.queryByText("Ridgeway Roofing")).not.toBeInTheDocument();
  });

  it("renders Google rating, Verified pill, and numeric VMB score on rich cards", async () => {
    render(<MatchesPage />);
    await waitFor(() => screen.getByText("BP Builds"));
    // Google rating shown with one decimal
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("(120)")).toBeInTheDocument();
    // Verified pill (mirrors desktop ShortlistSection language)
    expect(screen.getAllByText(/Verified/i).length).toBeGreaterThan(0);
    // Numeric VMB score — rendered as a coloured circle next to the avatar
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("navigates to /match/:id when a card is tapped", async () => {
    render(<MatchesPage />);
    await waitFor(() => screen.getByText("BP Builds"));
    const card = screen.getByRole("button", { name: /BP Builds/i });
    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/match/m1");
  });

  it("switches to Contacted tab", async () => {
    render(<MatchesPage />);
    await waitFor(() => screen.getByText("BP Builds"));
    fireEvent.click(screen.getByRole("tab", { name: /^Contacted/i }));
    expect(screen.getByText("Ridgeway Roofing")).toBeInTheDocument();
    expect(screen.queryByText("BP Builds")).not.toBeInTheDocument();
  });

  it("shows empty state on Archived", async () => {
    render(<MatchesPage />);
    await waitFor(() => screen.getByText("BP Builds"));
    fireEvent.click(screen.getByRole("tab", { name: /^Archived/i }));
    expect(screen.getByText(/No archived matches/i)).toBeInTheDocument();
  });
});
