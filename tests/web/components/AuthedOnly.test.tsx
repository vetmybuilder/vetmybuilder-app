// tests/web/components/AuthedOnly.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const ensureSignedInMock = vi.fn();
const useAuthMock = vi.fn();
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
  // AuthedOnly also imports isSignOutInProgress() to skip the sign-in
  // redirect mid-logout. Default to "not in progress" for the tests.
  isSignOutInProgress: () => false,
}));

const routerReplaceMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/projects",
    query: {},
    asPath: "/projects",
    push: vi.fn(),
    replace: routerReplaceMock,
  }),
}));

import AuthedOnly from "../../../web/components/AuthedOnly";

const FakeChild = () => <div data-testid="protected-child">protected content</div>;

function setLocation(pathname: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      ...window.location,
      pathname,
      search: "",
      href: "http://localhost:3000" + pathname,
    },
  });
}

function buildAuth(overrides: Record<string, unknown>) {
  return {
    user: null,
    loading: false,
    profileComplete: null,
    ensureSignedIn: ensureSignedInMock,
    ...overrides,
  };
}

describe("<AuthedOnly />", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    routerReplaceMock.mockReset();
    ensureSignedInMock.mockReset().mockResolvedValue({ uid: "x" });
    sessionStorage.clear();
    setLocation("/projects");
  });

  it("shows the loading state while auth is initialising", () => {
    useAuthMock.mockReturnValue(buildAuth({ loading: true }));

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    // AuthedOnly renders null while loading or unauthenticated to
    // avoid a brief flash of an old-design "Please sign in" card
    // during route transitions. Just assert the protected child
    // doesn't render - the absence of any visible chrome is the
    // intended behaviour.
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("kicks off ensureSignedIn when no user is present", async () => {
    useAuthMock.mockReturnValue(buildAuth({ loading: false, user: null }));

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    await waitFor(() => expect(ensureSignedInMock).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem("vmb:returnTo")).toBe("/projects");
  });

  it("on /projects, holds the loading state while profileComplete is null", () => {
    setLocation("/projects");
    useAuthMock.mockReturnValue(
      buildAuth({ user: { uid: "u1" }, profileComplete: null }),
    );

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    // AuthedOnly renders null while loading or unauthenticated to
    // avoid a brief flash of an old-design "Please sign in" card
    // during route transitions. Just assert the protected child
    // doesn't render - the absence of any visible chrome is the
    // intended behaviour.
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("on /projects, redirects mid-signup users (profileComplete=false) to /signup/complete", async () => {
    setLocation("/projects");
    useAuthMock.mockReturnValue(
      buildAuth({ user: { uid: "u1" }, profileComplete: false }),
    );

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/signup/complete"),
    );
    // Still loading until the redirect lands — must NOT flash the page
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("on /projects, renders the children when profileComplete is true", async () => {
    setLocation("/projects");
    useAuthMock.mockReturnValue(
      buildAuth({ user: { uid: "u1" }, profileComplete: true }),
    );

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    expect(screen.getByTestId("protected-child")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("on /admin/* (NOT a homeowner area), renders children even when profileComplete is false", async () => {
    setLocation("/admin/tradesmen-leaderboard");
    useAuthMock.mockReturnValue(
      buildAuth({ user: { uid: "admin1" }, profileComplete: false }),
    );

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    // Admin users legitimately have no homeowner postcode — they must NOT be
    // bounced to /signup/complete from admin pages.
    expect(screen.getByTestId("protected-child")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("on /tradesman/profile/edit (NOT a homeowner area), renders children even when profileComplete is false", async () => {
    setLocation("/tradesman/profile/edit");
    useAuthMock.mockReturnValue(
      buildAuth({ user: { uid: "trade1" }, profileComplete: false }),
    );

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    expect(screen.getByTestId("protected-child")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("on /projects/123 (homeowner sub-path), still gates on profileComplete", async () => {
    setLocation("/projects/123");
    useAuthMock.mockReturnValue(
      buildAuth({ user: { uid: "u1" }, profileComplete: false }),
    );

    render(
      <AuthedOnly>
        <FakeChild />
      </AuthedOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/signup/complete"),
    );
  });
});
