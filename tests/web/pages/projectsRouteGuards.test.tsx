// tests/web/pages/projectsRouteGuards.test.tsx
//
// Regression guards alongside homepage.role.test.tsx. The May 2026
// "tradesperson sees homeowner CTAs" bug pulled at this thread:
// /projects and /projects/new must redirect tradespeople back to the
// trade dashboard. Both pages already have client-side guards (they
// check sessionStorage first, then GET /api/tradesmen/me); these tests
// just lock that behaviour in so a refactor can't accidentally drop the
// redirect.

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// IntersectionObserver isn't shipped by jsdom.
class TestIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}
// @ts-ignore
globalThis.IntersectionObserver = TestIntersectionObserver as any;

// @ts-ignore
window.matchMedia =
  // @ts-ignore
  window.matchMedia ||
  ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

const get = vi.fn();
const post = vi.fn();
vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "trade-1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/projects",
    asPath: "/projects",
    push,
    replace,
    back: vi.fn(),
  }),
}));

// Layout + AuthedOnly pass-throughs so the test stays focused on the
// redirect logic, not the chrome.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AuthedOnly", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("/projects and /projects/new — tradesperson route guards", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    get.mockReset();
    // Clear the cache flag set by previous tests in this file.
    try {
      sessionStorage.removeItem("vmb:isTradesman");
    } catch {
      /* ignore */
    }
  });

  it("/projects redirects a tradesperson to /tradesman/jobs", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.includes("/api/tradesmen/me")) {
        return { data: { role: "tradesman", profile: { user_id: "trade-1" } } };
      }
      return { data: {} };
    });

    const { default: ProjectsList } = await import("@/pages/projects/index");
    render(<ProjectsList />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/tradesman/jobs");
    });
  });

  it("/projects/new redirects a tradesperson to /tradesman/jobs", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.includes("/api/tradesmen/me")) {
        return { data: { role: "tradesman", profile: { user_id: "trade-1" } } };
      }
      return { data: {} };
    });

    const { default: ProjectsNew } = await import("@/pages/projects/new");
    render(<ProjectsNew />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/tradesman/jobs");
    });
  });
});
