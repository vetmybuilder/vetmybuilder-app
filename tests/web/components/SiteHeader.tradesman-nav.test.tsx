// tests/web/components/SiteHeader.tradesman-nav.test.tsx
// Verifies that the desktop tradesman navigation (top-level header tabs)
// includes a "Matches" link pointing at /tradesman/matches. The link
// used to live in the trades dropdown menu but moved up into the
// TRADES_TABS strip during the header v2 redesign.
import { render, screen } from "@testing-library/react";
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

  it("renders a Matches tab pointing at /tradesman/matches", async () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Tina", lastName: "Trader" },
      loading: false,
      profileComplete: true,
    });

    render(<SiteHeader />);

    // Tabs render after /api/tradesmen/me resolves and the role check
    // marks the viewer as a tradesman. findByRole waits for that.
    // Bumped timeout to 5s because suite-wide CPU contention can push
    // this past the default 1000ms despite running in <600ms in isolation.
    const matchesTab = await screen.findByRole(
      "tab",
      { name: /matches/i },
      { timeout: 5000 },
    );
    expect(matchesTab).toHaveAttribute("href", "/tradesman/matches");
  });
});
