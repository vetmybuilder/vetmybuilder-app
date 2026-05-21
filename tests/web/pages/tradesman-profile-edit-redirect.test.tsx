// tests/web/pages/tradesman-profile-edit-redirect.test.tsx
//
// Regression coverage for the "trader cancelled mid-signup, then went
// to Manage account -> Edit profile, saw a red error flash" bug.
//
// /tradesman/profile/edit calls /api/tradesmen/me on mount. For a user
// whose user_roles is stamped 'tradesman' (role-intent ran) but who
// has no tradesmen row yet, the API returns
// { role: 'tradesman', profile: null }. The page must:
//   1. Detect this state.
//   2. Call router.replace('/tradesman/signup/complete') to nudge them
//      back into the wizard.
//   3. NOT render the "No trade profile found" error block while the
//      redirect is in flight.
//
// Earlier versions hard-coded role='user' for profile-less responses
// and / or rendered the error block during the navigation gap.

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Capture the replace target.
const routerReplaceMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/profile/edit",
    query: {},
    asPath: "/tradesman/profile/edit",
    push: vi.fn(),
    replace: routerReplaceMock,
  }),
}));

// Configurable /api/tradesmen/me response per test.
const apiGetMock = vi.fn();
vi.mock("@/utils/api", () => ({
  useApi: () => ({
    get: apiGetMock,
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }),
  API_ORIGIN: "",
}));

// AuthedOnly normally redirects unauthenticated users. In the test
// stack we just pass children through.
vi.mock("@/components/AuthedOnly", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The full SiteHeader / wizard chrome aren't needed to verify the
// redirect path; stub them to keep the test lightweight.
vi.mock("@/components/SiteHeader", () => ({
  default: () => <div data-testid="site-header-stub" />,
}));

vi.mock("@/components/BrandWatermarkScatter", () => ({
  default: () => null,
}));

vi.mock("@/components/wizard/WizardTopBar", () => ({
  default: () => <div data-testid="wizard-topbar-stub" />,
}));

vi.mock("@/components/wizard/WizardProgressBar", () => ({
  default: () => null,
}));

vi.mock("@/components/wizard/WizardNavBar", () => ({
  default: () => null,
}));

vi.mock("@/components/vendor-register/Step1Company", () => ({
  default: () => <div data-testid="step1-stub" />,
  Step1Form: {},
}));

vi.mock("@/components/vendor-register/Step2Trades", () => ({
  default: () => <div data-testid="step2-stub" />,
}));

vi.mock("@/components/vendor-register/Step3Offers", () => ({
  default: () => <div data-testid="step3-stub" />,
}));

vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

import EditProfilePage from "../../../web/pages/tradesman/profile/edit";

describe("/tradesman/profile/edit - redirect for mid-signup traders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /tradesman/signup/complete when role='tradesman' but no profile", async () => {
    apiGetMock.mockResolvedValue({
      data: { role: "tradesman", profile: null },
    });

    render(<EditProfilePage />);

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith(
        "/tradesman/signup/complete",
      );
    });
  });

  it("does NOT paint the 'No trade profile found' error block while redirecting", async () => {
    apiGetMock.mockResolvedValue({
      data: { role: "tradesman", profile: null },
    });

    const { container } = render(<EditProfilePage />);

    // Wait until the redirect has fired - the page should have entered
    // its `redirecting` state and rendered null.
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalled();
    });

    // Belt and braces: poll for the error text to never appear.
    await waitFor(() => {
      expect(container.textContent || "").not.toMatch(
        /No trade profile found/i,
      );
    });
  });

  it("does NOT redirect to /tradesman/signup/complete when the user is a real homeowner (role='user')", async () => {
    // A genuine homeowner who somehow landed on this page shouldn't get
    // bounced into the trade signup wizard. The redirect path is
    // strictly for `role === "tradesman" && !profile`.
    apiGetMock.mockResolvedValue({
      data: { role: "user", profile: null },
    });

    render(<EditProfilePage />);

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalled();
    });

    // Replace must NOT be called with the trade-signup destination.
    expect(routerReplaceMock).not.toHaveBeenCalledWith(
      "/tradesman/signup/complete",
    );
  });
});
