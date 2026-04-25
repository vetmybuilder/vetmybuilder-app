import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const get = vi.fn(async () => ({
  data: {
    leads: [
      {
        matchId: "m1",
        projectId: "p1",
        title: "Kitchen extension with bifolds",
        budget: "£15k–£25k",
        outward: "E4",
        startWindow: "1 month",
        homeownerFirstName: "Sarah",
        description: "4m rear extension…",
        trades: ["Building", "Electrics"],
        source: "recommended",
        recommenderName: "Alex",
        pickedHoursAgo: 2,
      },
    ],
    subscriptionActive: true,
  },
}));
const post = vi.fn(async () => ({ data: { status: "matched" } }));

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));
vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "b1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/tradesman/matches",
    asPath: "/tradesman/matches",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import TradesmanMatches from "@/pages/tradesman/matches";

describe("Tradesman matches page", () => {
  it("renders a lead card and commits accept", async () => {
    render(<TradesmanMatches />);
    await waitFor(() =>
      expect(screen.getByText(/Kitchen extension/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Sarah/)).toBeInTheDocument();
    expect(screen.getByText(/Recommended by Alex/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /like/i }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/swipe/respond", {
        matchId: "m1",
        direction: "right",
      }),
    );
  });
});
