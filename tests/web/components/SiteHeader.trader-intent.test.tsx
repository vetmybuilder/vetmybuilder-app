// tests/web/components/SiteHeader.trader-intent.test.tsx
//
// Regression coverage for the "header still says homeowner after a
// trader cancelled mid-signup" bug. A user who Firebase-OAuth'd into
// /tradesman/register-tradesmen, hit X on the wizard, and landed back
// on "/" used to see:
//   - the homeowner indigo pill (because /api/tradesmen/me responded
//     before role-intent had stamped user_roles)
//   - the "Trades" string label next to the trade chip (the previous
//     fallback when company was empty)
//
// Fixes pinned here:
//   1. SiteHeader.tsx introduces `traderIntent` (reads
//      vmb:tradesmanSignupInProgress and vmb:oauthIntent), folded into
//      effectiveIsTrades, which gates the trader chip and SUPPRESSES
//      the homeowner pill.
//   2. The trade chip label drops the "Trades" fallback when no
//      company is set - the avatar circle alone is enough until they
//      finish the wizard.

import { render, findByTestId, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const useAuthMock = vi.fn();
const signOutUserMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
  signOutUser: (...args: any[]) => signOutUserMock(...args),
}));

// /api/tradesmen/me default response: a user with NO profile (mid-signup).
// In the bug scenario, role would come back as 'user' here because the
// header's API call landed before role-intent. The fix is that even
// without a tradesman row OR a 'tradesman' role from the API, the
// in-progress sessionStorage flag flips the header to the trade variant.
const apiMock = {
  get: vi.fn(),
};
vi.mock("@/utils/api", () => ({
  useApi: () => apiMock,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/",
    query: {},
    asPath: "/",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import SiteHeader from "../../../web/components/SiteHeader";

describe("<SiteHeader /> mid-trader-signup intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({
      data: { role: "user", profile: null },
    });
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("renders the trade chip (not homeowner pill) when tradesmanSignupInProgress is set", async () => {
    sessionStorage.setItem("vmb:tradesmanSignupInProgress", "1");
    useAuthMock.mockReturnValue({
      user: { firstName: "Olive", lastName: "Tester" },
      loading: false,
      profileComplete: true,
    });

    const { container } = render(<SiteHeader />);

    const trade = await findByTestId(container, "trades-menu-button", {}, {
      timeout: 5000,
    });
    expect(trade).toBeTruthy();
    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();
  });

  it("renders the trade chip when vmb:oauthIntent='tradesman' is set", async () => {
    sessionStorage.setItem("vmb:oauthIntent", "tradesman");
    useAuthMock.mockReturnValue({
      user: { firstName: "Olive", lastName: "Tester" },
      loading: false,
      profileComplete: true,
    });

    const { container } = render(<SiteHeader />);

    await findByTestId(container, "trades-menu-button", {}, { timeout: 5000 });
    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();
  });

  it("hides the 'Trades' fallback label when there is no company yet", async () => {
    sessionStorage.setItem("vmb:tradesmanSignupInProgress", "1");
    useAuthMock.mockReturnValue({
      user: { firstName: "Olive", lastName: "Tester" },
      loading: false,
      profileComplete: true,
    });

    const { container } = render(<SiteHeader />);

    const trade = await findByTestId(container, "trades-menu-button", {}, {
      timeout: 5000,
    });
    // The chip's text content should not contain the literal "Trades"
    // fallback that used to render when company was empty.
    expect(trade.textContent || "").not.toMatch(/\bTrades\b/);
  });

  it("shows the company name in the chip once it is set (no fallback needed)", async () => {
    // Trader has completed signup - API returns the profile with a
    // company name. The chip should show the name and STILL suppress
    // the homeowner pill.
    apiMock.get.mockResolvedValueOnce({
      data: {
        role: "tradesman",
        profile: { company_name: "Acme Trades" },
      },
    });
    useAuthMock.mockReturnValue({
      user: { firstName: "Olive", lastName: "Tester" },
      loading: false,
      profileComplete: true,
    });

    const { container } = render(<SiteHeader />);

    await waitFor(() => {
      const chip = container.querySelector(
        '[data-testid="trades-menu-button"]',
      );
      expect(chip?.textContent || "").toContain("Acme Trades");
    });
    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();
  });
});
