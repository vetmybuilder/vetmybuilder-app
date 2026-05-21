// tests/web/pages/tradesman-signup-complete-redirect.test.tsx
//
// Regression coverage for the "trade signup wizard bounces a mid-signup
// user to /tradesman/jobs" bug.
//
// /tradesman/signup/complete mounts an effect that GETs /api/tradesmen/
// me. With the role-intent + me.get.js fallback fix, that endpoint now
// returns { role: 'tradesman', profile: null } for a user who's been
// role-stamped but hasn't filled the wizard yet. The previous code
// treated `role === 'tradesman' || !!profile` as "already onboarded"
// and replaced the route to /tradesman/jobs - kicking them away from
// the wizard they came to finish.
//
// Fix: only redirect when an actual tradesmen profile exists.
//
// These tests pin both branches:
//   - role='tradesman', profile=null -> STAY on /tradesman/signup/complete
//   - role='tradesman', profile=<real> -> REDIRECT to /tradesman/jobs

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Use vi.hoisted so the spies exist BEFORE vi.mock factories run.
// Otherwise const declarations land in TDZ when the page module loads
// and the factory captures `undefined` for the api.post mock - which
// then crashes the page's `.catch(...)` chain.
const mocks = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPutMock: vi.fn(),
  apiDeleteMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/signup/complete",
    query: {},
    asPath: "/tradesman/signup/complete",
    push: vi.fn(),
    replace: mocks.routerReplaceMock,
  }),
}));

vi.mock("@/utils/api", () => ({
  useApi: () => ({
    get: mocks.apiGetMock,
    post: mocks.apiPostMock,
    put: mocks.apiPutMock,
    delete: mocks.apiDeleteMock,
  }),
  API_ORIGIN: "",
}));

const useAuthMock = vi.fn();
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
  signOutUser: vi.fn(),
}));

vi.mock("@/utils/firebase", () => ({
  initFirebase: vi.fn(),
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

import SignupCompletePage from "../../../web/pages/tradesman/signup/complete";

describe("/tradesman/signup/complete - mid-signup redirect rules", () => {
  beforeEach(() => {
    mocks.routerReplaceMock.mockClear();
    mocks.apiGetMock.mockReset();
    mocks.apiPostMock.mockReset().mockResolvedValue({ data: { ok: true } });
    mocks.apiPutMock.mockReset().mockResolvedValue({ data: { ok: true } });
    mocks.apiDeleteMock.mockReset().mockResolvedValue({ data: { ok: true } });
    useAuthMock.mockReturnValue({
      user: { uid: "uid-mid-signup", email: "olive@example.com" },
      loading: false,
    });
    // beta-status defaults to required:false (trader path).
    mocks.apiGetMock.mockImplementation((url: string) => {
      if (String(url).startsWith("/api/auth/beta-status")) {
        return Promise.resolve({ data: { required: false } });
      }
      return Promise.resolve({ data: { role: "tradesman", profile: null } });
    });
  });

  it("does NOT bounce a mid-signup trader (role=tradesman, no profile) to /tradesman/jobs", async () => {
    render(<SignupCompletePage />);

    // Give the mount effect time to fire its /api/tradesmen/me lookup.
    await waitFor(() => {
      expect(
        mocks.apiGetMock.mock.calls.some(([url]: any[]) =>
          String(url).includes("/api/tradesmen/me"),
        ),
      ).toBe(true);
    });

    // Critically: the wizard must NOT have been replaced away.
    expect(mocks.routerReplaceMock).not.toHaveBeenCalledWith("/tradesman/jobs");
  });

  it("redirects a fully-onboarded trader (profile present) to /tradesman/jobs", async () => {
    mocks.apiGetMock.mockImplementation((url: string) => {
      if (String(url).startsWith("/api/auth/beta-status")) {
        return Promise.resolve({ data: { required: false } });
      }
      return Promise.resolve({
        data: {
          role: "tradesman",
          profile: { user_id: "uid-mid-signup", company_name: "Acme" },
        },
      });
    });

    render(<SignupCompletePage />);

    await waitFor(() => {
      expect(mocks.routerReplaceMock).toHaveBeenCalledWith("/tradesman/jobs");
    });
  });
});
