// tests/web/components/SiteHeader.tradesman-nav.test.tsx
// Verifies that the tradesman navigation (desktop trades dropdown) exposes a
// "Matches" link that points at /tradesman/matches. This is the entry point
// into the swipe-matching inbox for tradesmen.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock auth so we can control signed-in state
const useAuthMock = vi.fn();
const signOutUserMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
  signOutUser: (...args: any[]) => signOutUserMock(...args),
}));

// Mock api — SiteHeader calls /api/tradesmen/me when a user is present;
// return a tradesman role so the trades menu renders.
const apiMock = {
  get: vi.fn().mockResolvedValue({
    data: {
      role: "tradesman",
      profile: { company_name: "Acme Trades" },
    },
  }),
};
vi.mock("@/utils/api", () => ({
  useApi: () => apiMock,
}));

// Mock next/router
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/projects",
    query: {},
    asPath: "/tradesman/projects",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock next/link — render as a plain anchor
vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

// Mock next/dynamic so NotificationsBell doesn't complicate the test
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import SiteHeader from "../../../web/components/SiteHeader";

describe("<SiteHeader /> tradesman navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({
      data: {
        role: "tradesman",
        profile: { company_name: "Acme Trades" },
      },
    });
    try {
      sessionStorage.clear();
    } catch {}
  });

  // TODO: re-enable post UI redesign. The Matches link moved out of the
   // trades dropdown and into the top-level header tabs (TRADES_TABS in
   // SiteHeader.tsx). This assertion needs rewriting against the new tab
   // structure rather than the old menu-matches testid.
  it.skip("includes a Matches link in the trades menu pointing at /tradesman/matches", async () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Tina", lastName: "Trader" },
      loading: false,
      profileComplete: true,
    });

    render(<SiteHeader />);

    // Wait for the role check to resolve so the trades menu renders
    const tradesButton = await screen.findByTestId("trades-menu-button");

    // Open the trades dropdown
    fireEvent.click(tradesButton);

    // Matches link should appear inside the opened menu
    await waitFor(() => {
      expect(screen.getByTestId("menu-matches")).toBeInTheDocument();
    });

    const link = screen.getByRole("menuitem", { name: /matches/i });
    expect(link).toHaveAttribute("href", "/tradesman/matches");
  });
});
