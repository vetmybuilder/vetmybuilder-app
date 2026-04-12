// tests/web/components/GuestOnly.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const useAuthMock = vi.fn();
vi.mock("@/utils/auth", () => ({
  useAuth: () => useAuthMock(),
}));

const useRoleMock = vi.fn();
vi.mock("@/utils/useRole", () => ({
  useRole: () => useRoleMock(),
}));

const routerReplaceMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/signup",
    query: {},
    asPath: "/signup",
    push: vi.fn(),
    replace: routerReplaceMock,
  }),
}));

import GuestOnly from "../../../web/components/GuestOnly";

const FakeChild = () => <div data-testid="guest-child">guest content</div>;

function setLocation(search = "") {
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      ...window.location,
      pathname: "/signup",
      search,
      href: "http://localhost:3000/signup" + search,
    },
  });
}

describe("<GuestOnly />", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    useRoleMock.mockReset();
    routerReplaceMock.mockReset();
    sessionStorage.clear();
    setLocation("");
  });

  it("renders children when the visitor is a confirmed guest", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false, profileComplete: null });
    useRoleMock.mockReturnValue({ role: "guest", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    expect(screen.getByTestId("guest-child")).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("renders nothing while auth is still loading", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true, profileComplete: null });
    useRoleMock.mockReturnValue({ role: "guest", loading: true });

    const { container } = render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    expect(container.firstChild).toBeNull();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect when user is authed but profileComplete is unknown (still fetching /api/me)", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "u1" },
      loading: false,
      profileComplete: null,
    });
    useRoleMock.mockReturnValue({ role: "user", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    // Wait a tick to make sure the effect has had a chance to run
    await waitFor(() => expect(routerReplaceMock).not.toHaveBeenCalled());
    expect(screen.queryByTestId("guest-child")).not.toBeInTheDocument();
  });

  it("redirects mid-signup users (profileComplete=false) to /signup/complete", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "u1" },
      loading: false,
      profileComplete: false,
    });
    useRoleMock.mockReturnValue({ role: "user", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/signup/complete"),
    );
  });

  it("redirects authed homeowners with a complete profile to /projects", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "u1" },
      loading: false,
      profileComplete: true,
    });
    useRoleMock.mockReturnValue({ role: "user", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/projects"),
    );
  });

  it("honours sessionStorage vmb:oauthReturnTo for OAuth returning users", async () => {
    sessionStorage.setItem("vmb:oauthReturnTo", "/projects/42");
    useAuthMock.mockReturnValue({
      user: { uid: "u1" },
      loading: false,
      profileComplete: true,
    });
    useRoleMock.mockReturnValue({ role: "user", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/projects/42"),
    );
    // Should be cleared after consumption
    expect(sessionStorage.getItem("vmb:oauthReturnTo")).toBeNull();
  });

  it("honours an explicit ?next= URL param ahead of role-based default", async () => {
    setLocation("?next=/admin/dashboard");
    useAuthMock.mockReturnValue({
      user: { uid: "u1" },
      loading: false,
      profileComplete: true,
    });
    useRoleMock.mockReturnValue({ role: "user", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/dashboard"),
    );
  });

  it("redirects authed tradesmen to /tradesman/projects", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "u1" },
      loading: false,
      profileComplete: true,
    });
    useRoleMock.mockReturnValue({ role: "tradesman", loading: false });

    render(
      <GuestOnly>
        <FakeChild />
      </GuestOnly>,
    );

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/tradesman/projects"),
    );
  });
});
