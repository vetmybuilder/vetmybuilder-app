// tests/web/components/PushPromptMount.test.tsx
//
// Regression coverage for "trader signed up but never saw the
// notifications opt-in modal". Root cause: the mount only watched
// profileComplete, which is already true for OAuth traders (their
// Google displayName seeds firstName via touchUserMw on the first
// authed request). When the wizard set vmb:showPushPrompt = "1" much
// later, the useEffect dep never changed, so the flag was never read.
//
// Fix: also listen for routeChangeComplete and re-check the flag.
// The wizard router.replace's to /tradesman/jobs on success, which
// triggers the route event and opens the prompt - same surface as the
// homeowner flow.

import { render, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  routerEvents: {
    handlers: new Map<string, Set<() => void>>(),
    on(event: string, handler: () => void) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(handler);
    },
    off(event: string, handler: () => void) {
      this.handlers.get(event)?.delete(handler);
    },
    emit(event: string) {
      this.handlers.get(event)?.forEach((fn) => fn());
    },
  } as {
    handlers: Map<string, Set<() => void>>;
    on: (e: string, h: () => void) => void;
    off: (e: string, h: () => void) => void;
    emit: (e: string) => void;
  },
  useAuthMock: vi.fn(),
  useRoleMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/",
    query: {},
    asPath: "/",
    push: vi.fn(),
    replace: vi.fn(),
    events: mocks.routerEvents,
  }),
}));

vi.mock("@/utils/auth", () => ({
  useAuth: () => mocks.useAuthMock(),
}));

vi.mock("@/utils/useRole", () => ({
  useRole: () => mocks.useRoleMock(),
}));

// Stub the PushPrompt itself so we can detect it open/close via a
// data-testid without dragging in posthog / firebase messaging mocks.
vi.mock("@/components/PushPrompt", () => ({
  default: ({ isTradesman }: { isTradesman: boolean }) => (
    <div data-testid="push-prompt" data-tradesman={String(isTradesman)}>
      Stay in the loop
    </div>
  ),
}));

import PushPromptMount from "../../../web/components/PushPromptMount";

describe("<PushPromptMount /> route-change fire path", () => {
  beforeEach(() => {
    mocks.routerEvents.handlers.clear();
    vi.clearAllMocks();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("opens the prompt on routeChangeComplete when the flag was set after mount (trader signup path)", async () => {
    // Trader OAuth path: profileComplete is true from the start because
    // touchUserMw seeded firstName. The wizard sets the flag later.
    mocks.useAuthMock.mockReturnValue({ profileComplete: true });
    mocks.useRoleMock.mockReturnValue({ role: "tradesman", loading: false });

    const { queryByTestId } = render(<PushPromptMount />);

    // On mount, no flag in storage yet -> nothing rendered.
    expect(queryByTestId("push-prompt")).toBeNull();

    // The wizard saves, sets the flag, then router.replace's. The
    // route event fires and the mount re-reads sessionStorage.
    sessionStorage.setItem("vmb:showPushPrompt", "1");
    act(() => {
      mocks.routerEvents.emit("routeChangeComplete");
    });

    await waitFor(() => {
      const el = queryByTestId("push-prompt");
      expect(el).not.toBeNull();
    });
    // Trader palette flows through from useRole.
    expect(queryByTestId("push-prompt")?.getAttribute("data-tradesman")).toBe(
      "true",
    );
  });

  it("opens the prompt for the homeowner flow when the flag is set at mount (profileComplete flips to true)", async () => {
    sessionStorage.setItem("vmb:showPushPrompt", "1");
    mocks.useAuthMock.mockReturnValue({ profileComplete: true });
    mocks.useRoleMock.mockReturnValue({ role: "user", loading: false });

    const { queryByTestId } = render(<PushPromptMount />);

    await waitFor(() => {
      expect(queryByTestId("push-prompt")).not.toBeNull();
    });
    expect(queryByTestId("push-prompt")?.getAttribute("data-tradesman")).toBe(
      "false",
    );
  });

  it("only fires once - the flag is cleared after the first read so subsequent route changes don't reopen it", async () => {
    mocks.useAuthMock.mockReturnValue({ profileComplete: true });
    mocks.useRoleMock.mockReturnValue({ role: "tradesman", loading: false });

    const { queryByTestId } = render(<PushPromptMount />);

    sessionStorage.setItem("vmb:showPushPrompt", "1");
    act(() => mocks.routerEvents.emit("routeChangeComplete"));

    await waitFor(() => {
      expect(queryByTestId("push-prompt")).not.toBeNull();
    });
    // The mount removes the flag on read.
    expect(sessionStorage.getItem("vmb:showPushPrompt")).toBeNull();
  });

  it("does NOT fire when profileComplete is still null (mid-signup, awaiting /api/me)", async () => {
    sessionStorage.setItem("vmb:showPushPrompt", "1");
    mocks.useAuthMock.mockReturnValue({ profileComplete: null });
    mocks.useRoleMock.mockReturnValue({ role: "tradesman", loading: false });

    const { queryByTestId } = render(<PushPromptMount />);
    act(() => mocks.routerEvents.emit("routeChangeComplete"));

    // Wait long enough for the effect chain to settle.
    await new Promise((r) => setTimeout(r, 30));
    expect(queryByTestId("push-prompt")).toBeNull();
    // And the flag must not be cleared - the mount is still waiting
    // for profileComplete to land.
    expect(sessionStorage.getItem("vmb:showPushPrompt")).toBe("1");
  });
});
