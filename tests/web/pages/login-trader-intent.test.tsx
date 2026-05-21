// tests/web/pages/login-trader-intent.test.tsx
//
// Pins the trader-intent post-OAuth routing on /login. Previously the
// page trusted `role === "tradesman"` from useRole to decide between
// /tradesman/jobs and /tradesman/signup/complete. But useRole now
// also returns "tradesman" whenever vmb:oauthIntent / signup-in-
// progress flags are set (so the header chrome flips to emerald
// during mid-signup). Trusting that for routing meant a brand-new
// Google account got sent straight to /tradesman/jobs and never saw
// the wizard.
//
// The page now does an authoritative /api/tradesmen/me check and
// routes based on whether a real `profile` exists. The intent flag
// only decides WHICH trader destination to use; the API decides which
// trader STATE the user is in.

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  useAuthMock: vi.fn(),
  useRoleMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/login",
    query: { next: "/tradesman/jobs" },
    asPath: "/login?next=/tradesman/jobs",
    push: vi.fn(),
    replace: mocks.routerReplaceMock,
    events: { on: vi.fn(), off: vi.fn() },
    isReady: true,
  }),
}));

vi.mock("@/utils/auth", () => ({
  useAuth: () => mocks.useAuthMock(),
  signOutUser: vi.fn(),
}));

vi.mock("@/utils/useRole", () => ({
  useRole: () => mocks.useRoleMock(),
}));

vi.mock("@/utils/firebase", () => ({
  initFirebase: () => ({
    currentUser: { getIdToken: vi.fn().mockResolvedValue("test-token") },
  }),
}));

vi.mock("@/utils/api", () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  }),
  API_ORIGIN: "",
}));

vi.mock("@/utils/analytics", () => ({
  trackLogin: vi.fn(),
}));

vi.mock("@/components/forms/OAuthSignInButton", () => ({
  default: () => <div data-testid="oauth-stub" />,
}));

vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

vi.mock("next/head", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  Object.values(mocks).forEach((m: any) => {
    if (typeof m?.mockReset === "function") m.mockReset();
  });
  // Default: authed user with oauthIntent='tradesman' (the case we
  // care about pinning).
  mocks.useAuthMock.mockReturnValue({
    user: { uid: "uid-fresh" },
    loading: false,
    profileComplete: true,
  });
  mocks.useRoleMock.mockReturnValue({
    role: "tradesman",
    loading: false,
  });
  try {
    sessionStorage.clear();
    sessionStorage.setItem("vmb:oauthIntent", "tradesman");
  } catch {
    /* ignore */
  }
  // Patch global fetch so the authoritative /api/tradesmen/me check
  // can be configured per test.
  // @ts-expect-error - jsdom doesn't have fetch by default
  global.fetch = mocks.fetchMock;
});

import LoginPage from "../../../web/pages/login";

describe("/login - trader-intent post-OAuth routing", () => {
  it("sends a brand-new Google account (role-intent stamped, no profile) to /tradesman/signup/complete", async () => {
    mocks.fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/tradesmen/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ role: "tradesman", profile: null }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.routerReplaceMock).toHaveBeenCalledWith(
        "/tradesman/signup/complete",
      );
    });
    expect(mocks.routerReplaceMock).not.toHaveBeenCalledWith(
      "/tradesman/jobs",
    );
  });

  it("sends a fully-onboarded trader (profile present) to /tradesman/jobs", async () => {
    mocks.fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/tradesmen/me")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              role: "tradesman",
              profile: { user_id: "uid-fresh", company_name: "Acme" },
            }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.routerReplaceMock).toHaveBeenCalledWith("/tradesman/jobs");
    });
    expect(mocks.routerReplaceMock).not.toHaveBeenCalledWith(
      "/tradesman/signup/complete",
    );
  });

  it("falls back to the wizard when the API lookup fails (safer than the dashboard)", async () => {
    mocks.fetchMock.mockImplementation(() =>
      Promise.reject(new Error("network")),
    );

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.routerReplaceMock).toHaveBeenCalledWith(
        "/tradesman/signup/complete",
      );
    });
  });
});
