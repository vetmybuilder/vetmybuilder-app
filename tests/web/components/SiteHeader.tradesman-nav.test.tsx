// tests/web/components/SiteHeader.tradesman-nav.test.tsx
// Verifies the trade-side header navigation. Matches is no longer
// surfaced as a top-level tab - matched threads now live in the
// messages dropdown (Activity tab) + the bottom-right dock, so the
// standalone /tradesman/matches link was removed from the desktop
// header. The other three tabs - Jobs, Jobs list, and Incoming
// interest - still render.
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
    pathname: "/tradesman/jobs",
    query: {},
    asPath: "/tradesman/jobs",
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

  it("renders Jobs / Jobs list / Incoming interest tabs (Matches removed)", async () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Tina", lastName: "Trader" },
      loading: false,
      profileComplete: true,
    });

    render(<SiteHeader />);

    // Tabs render after /api/tradesmen/me resolves and the role check
    // marks the viewer as a tradesman.
    const jobsTab = await screen.findByRole(
      "tab",
      { name: /^jobs$/i },
      { timeout: 5000 },
    );
    expect(jobsTab).toHaveAttribute("href", "/tradesman/jobs");

    expect(
      screen.getByRole("tab", { name: /jobs list/i }),
    ).toHaveAttribute("href", "/tradesman/jobs/list");
    expect(
      screen.getByRole("tab", { name: /incoming interest/i }),
    ).toHaveAttribute("href", "/tradesman/leads");

    // Regression guard: the Matches tab was removed in favour of the
    // messages dropdown's Activity tab + the bottom-right dock. If a
    // future change accidentally re-adds it, this assertion fires.
    expect(
      screen.queryByRole("tab", { name: /matches/i }),
    ).not.toBeInTheDocument();
  });
});
