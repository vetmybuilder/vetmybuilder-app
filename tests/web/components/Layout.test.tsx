// tests/web/components/Layout.test.tsx
import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock auth so we can control logged-out / logged-in states
const useAuthMock = vi.fn();
const signOutUserMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
  signOutUser: (...args: any[]) => signOutUserMock(...args),
}));

// Mock api (SiteHeader calls api.get("/api/tradesmen/me") when user is present)
const apiMock = { get: vi.fn().mockResolvedValue({ data: {} }) };
vi.mock("@/utils/api", () => ({
  useApi: () => apiMock,
}));

// Mock next/router (SiteHeader uses useRouter)
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/test",
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock next/link
vi.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  );
  return { default: Link };
});

// Mock next/dynamic so the dynamic NotificationsBell doesn't complicate this test.
// It returns a dummy component (null) for any dynamic import used by Layout.
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

import Layout from "../../../web/components/Layout";

describe("<Layout />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders “Sign in” CTA when logged out", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(
      <Layout>
        <div>content</div>
      </Layout>
    );

    // Header shows "Sign in"
    expect(screen.getByTestId("nav-sign-in")).toBeInTheDocument();

    // Main content renders. Use the main region to avoid confusion with "Skip to content".
    const main = screen.getByTestId("main-content");
    expect(within(main).getByText(/content/i)).toBeInTheDocument();

    // No account menu when logged out
    expect(screen.queryByTestId("account-menu-button")).not.toBeInTheDocument();
  });

  it("shows account button and initials when signed in", () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Chris", lastName: "Morris" },
      loading: false,
    });

    render(<Layout>content</Layout>);

    // Account button and initials
    expect(screen.getByTestId("account-menu-button")).toBeInTheDocument();
    expect(screen.getByTestId("account-initials")).toHaveTextContent("CM");

    // No "Sign in" when logged in
    expect(screen.queryByTestId("nav-sign-in")).not.toBeInTheDocument();
  });

  it("opens the account menu and can click Logout", async () => {
    useAuthMock.mockReturnValue({
      user: { firstName: "Chris", lastName: "Morris" },
      loading: false,
    });

    render(<Layout>content</Layout>);

    // Open menu
    fireEvent.click(screen.getByTestId("account-menu-button"));
    const menu = await screen.findByTestId("account-menu");
    expect(menu).toBeInTheDocument();

    // Click logout
    fireEvent.click(screen.getByTestId("menu-logout"));
    expect(signOutUserMock).toHaveBeenCalledTimes(1);
  });
});
