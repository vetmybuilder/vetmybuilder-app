// tests/web/pages/projectsEdit.test.tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stubs jsdom doesn't ship.
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

// matchMedia for any responsive component used by the page tree.
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

const { get, put, apiSingleton, authSingleton } = vi.hoisted(() => {
  const get = vi.fn(async (url: string) => {
    if (url.includes("/api/tradesmen/me")) {
      return { data: { role: "homeowner", profile: null } };
    }
    if (url.match(/\/api\/projects\/42$/)) {
      return {
        data: {
          project: {
            id: 42,
            name: "Bathroom refit in E4",
            type: "Bathroom Remodel (Full)",
            location: "E4 7EA",
            description:
              "Timeframe: Soon (2-4 weeks).\nBudget: 5k - 15k.\nReplace bath with walk-in shower.",
            propertyType: "Semi-Detached",
            bedrooms: 3,
            answers_json: null,
          },
        },
      };
    }
    return { data: {} };
  });
  const put = vi.fn();
  // Stable singletons — fresh objects per render would retrigger the load
  // effect (deps include `api` and `user`) and trap us in a Loading loop.
  const apiSingleton = { get, post: vi.fn(), put };
  const authSingleton = {
    user: { uid: "ho1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  };
  return { get, put, apiSingleton, authSingleton };
});

vi.mock("@/utils/api", () => ({ useApi: () => apiSingleton }));

vi.mock("@/utils/auth", () => ({ useAuth: () => authSingleton }));

const { push, replace, routerSingleton } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  const routerSingleton = {
    query: { id: "42" },
    isReady: true,
    pathname: "/projects/[id]/edit",
    asPath: "/projects/42/edit",
    push,
    replace,
    back: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  };
  return { push, replace, routerSingleton };
});

vi.mock("next/router", () => ({
  useRouter: () => routerSingleton,
}));

// AuthedOnly is a passthrough in tests — render children unconditionally.
vi.mock("@/components/AuthedOnly", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub Layout so we don't pull SiteHeader / Firebase / etc.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout-wrap">{children}</div>
  ),
}));

import EditProjectPage from "@/pages/projects/[id]/edit";

describe("Edit project - desktop wizard", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    get.mockClear();
    put.mockClear();
  });

  const WAIT = { timeout: 5000 };

  // The page renders both mobile and desktop trees in jsdom (no media
  // query gating). Component tests target the desktop wizard only -
  // mobile responsive coverage is owned by the Playwright e2e suite.
  // Scope all queries inside the desktop `wizard-edit` wrapper.
  it("renders step 1 with the canonical title once project is pre-loaded", async () => {
    render(<EditProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-edit")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-edit"));
    expect(desktop.getByTestId("step-title")).toHaveTextContent(
      "What do you need done?",
    );
  });

  it("pre-selects the inferred category from the loaded project", async () => {
    render(<EditProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-edit")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-edit"));
    // "Bathroom Remodel (Full)" lives under the Bathroom category - that
    // tile should be pre-selected (aria-pressed) on the loaded project.
    const tile = desktop.getByTestId("category-Bathroom");
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the Step 1 of N indicator in edit mode", async () => {
    render(<EditProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-edit")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-edit"));
    expect(desktop.getByText(/Step 1 of \d+/i)).toBeInTheDocument();
  });
});
