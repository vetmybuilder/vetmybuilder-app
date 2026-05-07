// tests/web/pages/match.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const get = vi.fn(async () => ({
  data: {
    match: {
      builderName: "James H.",
      homeownerName: "Sarah M.",
      phone: "07000 000000",
      email: "james@harrow.co.uk",
    },
  },
}));

vi.mock("@/utils/api", () => ({
  useApi: () => ({ get, post: vi.fn() }),
}));

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
    query: { matchId: "m1" },
    isReady: true,
    pathname: "/match/m1",
    asPath: "/match/m1",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import MatchPage from "@/pages/match/[matchId]";

describe("MatchPage", () => {
  it("renders the match celebration and contact info", async () => {
    render(<MatchPage />);
    // The page renders two h1 elements (one per viewport branch -
    // mobile and desktop). Both should carry the "It's a match!"
    // copy. Using getAllByRole + .some() so we don't depend on which
    // viewport is "active" in the test render.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("heading", { level: 1 })
          .some((el) => /it'?s a\s+match/i.test(el.textContent || "")),
      ).toBe(true),
    );
    expect(screen.getAllByText(/James H\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/07000 000000/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /whatsapp/i })[0],
    ).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });
});
