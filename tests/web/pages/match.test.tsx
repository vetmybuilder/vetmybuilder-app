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
    await waitFor(() =>
      expect(screen.getByText(/It's a match/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/James H\./)).toBeInTheDocument();
    expect(screen.getByText(/07000 000000/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /whatsapp/i }),
    ).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });
});
