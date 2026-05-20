// tests/web/components/SiteHeader.role-flicker.test.tsx
//
// Regression coverage for the homeowner-initials flicker that briefly
// rendered after a trader logged in over a previous homeowner session.
//
// Root cause: the sessionStorage role cache could be stale, and the
// header used to set `roleChecked=true` from that cache before the live
// /api/tradesmen/me call had spoken. With cache="0" and the API still
// in flight, the homeowner pill rendered for one frame.
//
// Fix: the cache seed is cosmetic only - roleChecked stays false until
// the API has resolved. Both visible pill variants are gated on
// roleChecked, so neither renders during the inflight window.
//
// This test loads the header for a logged-in trader with a stale
// homeowner cache and asserts the homeowner-initials pill NEVER renders
// at any point - before OR after the API resolves.

import { render, findByTestId } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const useAuthMock = vi.fn();
const signOutUserMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
  signOutUser: (...args: any[]) => signOutUserMock(...args),
}));

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

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/jobs",
    query: {},
    asPath: "/tradesman/jobs",
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

describe("<SiteHeader /> role-pill flicker", () => {
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

  it("never renders the homeowner pill when a trader has a stale homeowner cache", async () => {
    // Stale cache from a prior homeowner session
    sessionStorage.setItem("vmb:isTradesman", "0");

    useAuthMock.mockReturnValue({
      user: { firstName: "Tina", lastName: "Trader" },
      loading: false,
      profileComplete: true,
    });

    const { container } = render(<SiteHeader />);

    // Synchronous first render (before any effect fires): no homeowner
    // pill should exist. roleChecked is false, so the gate is closed.
    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();

    // Wait for the API to resolve and the trade pill to render.
    await findByTestId(
      container,
      "trades-menu-button",
      {},
      { timeout: 5000 },
    );

    // And the homeowner pill must STILL never have rendered.
    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();
  });

  it("never renders the homeowner pill on a fresh login (empty cache)", async () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Tina", lastName: "Trader" },
      loading: false,
      profileComplete: true,
    });

    const { container } = render(<SiteHeader />);

    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();

    await findByTestId(
      container,
      "trades-menu-button",
      {},
      { timeout: 5000 },
    );

    expect(
      container.querySelector('[data-testid="account-initials"]'),
    ).toBeNull();
  });
});
