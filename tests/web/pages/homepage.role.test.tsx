// tests/web/pages/homepage.role.test.tsx
//
// Regression guard for the May 2026 bug where a logged-in tradesperson
// saw the homeowner CTAs ("Post a new job" / "My projects") on the
// landing page. Root cause was reading the vmb:isTradesman sessionStorage
// flag directly with no API fallback, so any tradesperson hitting / before
// SiteHeader had cached their role got the wrong CTAs.
//
// We assert the right CTA pair for each of the three viewer roles.
// The hook (useRole) is mocked so each test can plant a deterministic
// role without spinning up auth + API plumbing.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const useRoleMock = vi.fn();
vi.mock("@/utils/useRole", () => ({
  useRole: () => useRoleMock(),
}));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: useAuthUser(),
    loading: useAuthLoading(),
  }),
}));

// useAuth mirrors so each test can flip "logged in" / "still loading"
// without touching the mock factory itself.
let currentUser: { uid: string } | null = null;
let currentAuthLoading = false;
function useAuthUser() {
  return currentUser;
}
function useAuthLoading() {
  return currentAuthLoading;
}

// Stub heavy children so this test stays focused on the CTA rendering.
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));
vi.mock("@/components/home/HomeContactSection", () => ({
  default: () => <div />,
}));
vi.mock("@/components/BrandWatermarkScatter", () => ({ default: () => <div /> }));

// next/image refuses to render under jsdom without a proper loader.
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span aria-label={alt} />,
}));

import Home from "@/pages/index";

describe("<Home /> homepage CTAs by role", () => {
  beforeEach(() => {
    currentUser = null;
    currentAuthLoading = false;
    useRoleMock.mockReset();
  });

  it("renders the homeowner CTAs for a logged-in homeowner", () => {
    currentUser = { uid: "homeowner-1" };
    useRoleMock.mockReturnValue({ role: "user", loading: false });

    render(<Home />);

    expect(screen.getByText("Post a new job")).toBeInTheDocument();
    expect(screen.getByText("My projects")).toBeInTheDocument();
    expect(screen.queryByText("View available jobs")).not.toBeInTheDocument();
  });

  it("renders the trade CTAs for a logged-in tradesperson", () => {
    currentUser = { uid: "trade-1" };
    useRoleMock.mockReturnValue({ role: "tradesman", loading: false });

    render(<Home />);

    expect(screen.getByText("View available jobs")).toBeInTheDocument();
    // The bug: trades were seeing these homeowner CTAs. Lock them out.
    expect(screen.queryByText("Post a new job")).not.toBeInTheDocument();
    expect(screen.queryByText("My projects")).not.toBeInTheDocument();
  });

  it("renders the guest CTAs (unchanged) when no user is signed in", () => {
    currentUser = null;
    useRoleMock.mockReturnValue({ role: "guest", loading: false });

    render(<Home />);

    // Guests now see ONLY the See-how-it-works scroll link in the hero.
    // The "Post a job" CTA was promoted into the sticky SiteHeader so
    // it's persistent across scroll - tested separately in the header
    // suite. None of the auth-gated CTAs should appear.
    expect(screen.getByText("See how it works")).toBeInTheDocument();
    expect(screen.queryByText("Post a job")).not.toBeInTheDocument();
    expect(screen.queryByText("Post a new job")).not.toBeInTheDocument();
    expect(screen.queryByText("My projects")).not.toBeInTheDocument();
    expect(screen.queryByText("View available jobs")).not.toBeInTheDocument();
  });

  it("renders no auth CTAs while the role is still resolving for a signed-in user", () => {
    currentUser = { uid: "u-pending" };
    // Simulates the race that caused the original bug: user known, role
    // not yet resolved. We should render nothing rather than fall back
    // to the homeowner CTAs and flash incorrect actions.
    useRoleMock.mockReturnValue({ role: "guest", loading: true });

    render(<Home />);

    expect(screen.queryByText("Post a new job")).not.toBeInTheDocument();
    expect(screen.queryByText("My projects")).not.toBeInTheDocument();
    expect(screen.queryByText("View available jobs")).not.toBeInTheDocument();
  });

  it("renders no auth CTAs while auth itself is still loading (URL-bar nav flicker case)", () => {
    // Reproduces the URL-bar navigation flicker: page mounts before
    // useAuth has reported whether there's a user yet. Without the
    // authLoading guard we'd briefly render the guest "Post a job"
    // CTA, then swap to whichever role-correct pair once auth + role
    // resolved. The fix: render nothing while authLoading is true.
    currentUser = null;
    currentAuthLoading = true;
    useRoleMock.mockReturnValue({ role: "guest", loading: false });

    render(<Home />);

    expect(screen.queryByText("Post a new job")).not.toBeInTheDocument();
    expect(screen.queryByText("My projects")).not.toBeInTheDocument();
    expect(screen.queryByText("View available jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("Post a job")).not.toBeInTheDocument();
  });
});
