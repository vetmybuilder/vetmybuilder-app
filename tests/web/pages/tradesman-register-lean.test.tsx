// tests/web/pages/tradesman-register-lean.test.tsx
//
// Pins the trader registration ENTRY page. The 4-step inline wizard
// at /tradesman/register-tradesmen has been removed; the page is now
// a thin landing that authenticates the trader (Google or email +
// password) and bounces into /tradesman/signup/complete for the
// company-detail wizard. Without these tests the lean page could
// silently lose the Google button, the email form, or the sign-in
// link without anything catching it.

import { render, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  routerPushMock: vi.fn(),
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  useAuthMock: vi.fn(),
  useRoleMock: vi.fn(),
  createUserMock: vi.fn(),
  ensureEmailAvailableMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/tradesman/register-tradesmen",
    query: {},
    asPath: "/tradesman/register-tradesmen",
    push: mocks.routerPushMock,
    replace: mocks.routerReplaceMock,
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

vi.mock("@/utils/api", () => ({
  useApi: () => ({
    get: mocks.apiGetMock,
    post: mocks.apiPostMock,
    put: vi.fn().mockResolvedValue({ data: { ok: true } }),
    delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
  }),
  API_ORIGIN: "",
}));

vi.mock("@/utils/auth", () => ({
  useAuth: () => mocks.useAuthMock(),
}));

vi.mock("@/utils/useRole", () => ({
  useRole: () => mocks.useRoleMock(),
}));

vi.mock("@/utils/firebase", () => ({
  initFirebase: () => ({}),
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) =>
    mocks.createUserMock(...args),
}));

vi.mock("@/utils/email", () => ({
  ensureEmailAvailable: (...args: unknown[]) =>
    mocks.ensureEmailAvailableMock(...args),
}));

vi.mock("@/components/BrandWatermarkScatter", () => ({
  default: () => null,
}));

vi.mock("@/components/wizard/WizardTopBar", () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="wizard-topbar">{title}</div>
  ),
}));

vi.mock("@/components/forms/OAuthSignInButton", () => ({
  default: ({ intent }: { intent?: string }) => (
    <button data-testid="google-signin-button" data-intent={intent}>
      Continue with Google
    </button>
  ),
}));

vi.mock("@/components/forms/PasswordChecklist", () => ({
  default: ({ password }: { password: string }) => (
    <div data-testid="password-checklist">checks for {password}</div>
  ),
  isStrongPassword: (pw: string) =>
    !!pw &&
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw),
}));

vi.mock("@/utils/analytics", () => ({
  trackRegisterStepCompleted: vi.fn(),
}));

vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
  return { default: Link };
});

import TradesmanRegisterPage from "../../../web/pages/tradesman/register-tradesmen";

describe("/tradesman/register-tradesmen - lean entry page", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m: any) => {
      if (typeof m?.mockReset === "function") m.mockReset();
    });
    mocks.useAuthMock.mockReturnValue({ user: null, loading: false });
    mocks.useRoleMock.mockReturnValue({ role: "guest", loading: false });
    mocks.apiGetMock.mockResolvedValue({ data: { required: false } });
    mocks.apiPostMock.mockResolvedValue({ data: { ok: true } });
    mocks.ensureEmailAvailableMock.mockResolvedValue(undefined);
    mocks.createUserMock.mockResolvedValue({ user: { uid: "uid-fresh" } });
  });

  it("renders the Google CTA + email form + 'Already a member?' sign-in link", () => {
    const { getByTestId } = render(<TradesmanRegisterPage />);
    expect(getByTestId("google-signin-button")).toBeTruthy();
    expect(getByTestId("signup-email")).toBeTruthy();
    expect(getByTestId("signup-password")).toBeTruthy();
    expect(getByTestId("signup-confirm")).toBeTruthy();
    expect(getByTestId("signup-submit")).toBeTruthy();
    expect(getByTestId("link-vendor-signin")).toBeTruthy();
  });

  it("tags the Google button with intent='tradesman' so the post-OAuth router sends them to the wizard", () => {
    const { getByTestId } = render(<TradesmanRegisterPage />);
    expect(getByTestId("google-signin-button").getAttribute("data-intent")).toBe(
      "tradesman",
    );
  });

  it("points the 'Already a member?' link at /login?next=/tradesman/jobs", () => {
    const { getByTestId } = render(<TradesmanRegisterPage />);
    expect(getByTestId("link-vendor-signin").getAttribute("href")).toBe(
      "/login?next=/tradesman/jobs",
    );
  });

  it("renders the password checklist once the user starts typing", () => {
    const { getByTestId, queryByTestId } = render(<TradesmanRegisterPage />);
    expect(queryByTestId("password-checklist")).toBeNull();
    fireEvent.change(getByTestId("signup-password"), {
      target: { value: "abc" },
    });
    expect(queryByTestId("password-checklist")).toBeTruthy();
  });

  it("blocks submit on a weak password and surfaces an error", async () => {
    const { getByTestId, findByText } = render(<TradesmanRegisterPage />);
    fireEvent.change(getByTestId("signup-email"), {
      target: { value: "olive@example.com" },
    });
    fireEvent.change(getByTestId("signup-password"), {
      target: { value: "abc" },
    });
    fireEvent.change(getByTestId("signup-confirm"), {
      target: { value: "abc" },
    });
    fireEvent.click(getByTestId("signup-submit"));
    await findByText(/at least 8 characters/i);
    expect(mocks.createUserMock).not.toHaveBeenCalled();
  });

  it("blocks submit when passwords don't match", async () => {
    const { getByTestId, findByText } = render(<TradesmanRegisterPage />);
    fireEvent.change(getByTestId("signup-email"), {
      target: { value: "olive@example.com" },
    });
    fireEvent.change(getByTestId("signup-password"), {
      target: { value: "Password123!" },
    });
    fireEvent.change(getByTestId("signup-confirm"), {
      target: { value: "Password123!x" },
    });
    fireEvent.click(getByTestId("signup-submit"));
    await findByText(/passwords do not match/i);
    expect(mocks.createUserMock).not.toHaveBeenCalled();
  });

  it("creates the Firebase user, stamps the trade role-intent, and replaces into /tradesman/signup/complete on success", async () => {
    const { getByTestId } = render(<TradesmanRegisterPage />);
    fireEvent.change(getByTestId("signup-email"), {
      target: { value: "olive@example.com" },
    });
    fireEvent.change(getByTestId("signup-password"), {
      target: { value: "Password123!" },
    });
    fireEvent.change(getByTestId("signup-confirm"), {
      target: { value: "Password123!" },
    });
    fireEvent.click(getByTestId("signup-submit"));

    await waitFor(() => {
      expect(mocks.createUserMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mocks.apiPostMock).toHaveBeenCalledWith(
        "/api/auth/role-intent",
        { role: "tradesman" },
      );
    });
    await waitFor(() => {
      expect(mocks.routerReplaceMock).toHaveBeenCalledWith(
        "/tradesman/signup/complete",
      );
    });
  });

  it("passes role='trader' to ensureEmailAvailable so the homeowner beta gate doesn't block the trader signup", async () => {
    const { getByTestId } = render(<TradesmanRegisterPage />);
    fireEvent.change(getByTestId("signup-email"), {
      target: { value: "olive@example.com" },
    });
    fireEvent.change(getByTestId("signup-password"), {
      target: { value: "Password123!" },
    });
    fireEvent.change(getByTestId("signup-confirm"), {
      target: { value: "Password123!" },
    });
    fireEvent.click(getByTestId("signup-submit"));

    await waitFor(() => {
      expect(mocks.ensureEmailAvailableMock).toHaveBeenCalled();
    });
    const args = mocks.ensureEmailAvailableMock.mock.calls[0];
    // ensureEmailAvailable(api, email, betaCode | undefined, role)
    expect(args[1]).toBe("olive@example.com");
    expect(args[3]).toBe("trader");
  });
});
