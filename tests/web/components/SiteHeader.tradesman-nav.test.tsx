// tests/web/components/SiteHeader.tradesman-nav.test.tsx
// Verifies the trade-side header navigation. The centred tab pills
// were retired in the dark-navbar refresh - trade nav now lives in the
// avatar dropdown to mirror the homeowner pattern. This spec opens the
// dropdown and asserts the expected items render (Jobs / Incoming
// interest / Manage account) and that Matches stays absent.
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("renders Jobs / Incoming interest / Manage account in the trades dropdown (Matches removed)", async () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Tina", lastName: "Trader" },
      loading: false,
      profileComplete: true,
    });

    render(<SiteHeader />);

    // The dropdown button appears once /api/tradesmen/me resolves and
    // the role check marks the viewer as a tradesman.
    const menuBtn = await screen.findByTestId(
      "trades-menu-button",
      {},
      { timeout: 5000 },
    );
    fireEvent.click(menuBtn);

    expect(screen.getByTestId("menu-jobs")).toHaveAttribute(
      "href",
      "/tradesman/jobs/list",
    );
    expect(screen.getByTestId("menu-incoming-interest")).toHaveAttribute(
      "href",
      "/tradesman/leads",
    );
    expect(screen.getByTestId("menu-account")).toHaveAttribute(
      "href",
      "/tradesman/account",
    );

    // Regression guard: Matches was removed in favour of the messages
    // dropdown's Activity tab + the bottom-right dock.
    expect(
      screen.queryByRole("menuitem", { name: /matches/i }),
    ).not.toBeInTheDocument();
  });
});
