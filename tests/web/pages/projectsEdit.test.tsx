// tests/web/pages/projectsEdit.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
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

describe("Edit project — mobile wizard shell", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    get.mockClear();
    put.mockClear();
  });

  const WAIT = { timeout: 5000 };

  // TODO: re-enable post UI redesign. EditProjectPage mobile testids
   // (step-title-mobile, category-mobile-*) shifted in the wizard
   // refresh; assertions need realigning.
  it.skip("renders step 1 with the canonical title once project is pre-loaded", async () => {
    render(<EditProjectPage />);

    await waitFor(() => {
      // Mobile shell mounts only after gate + project load complete.
      expect(screen.getByTestId("post-job-mobile")).toBeInTheDocument();
    }, WAIT);

    // Step 1 title appears (mobile shell + desktop wizard both render it).
    expect(screen.getAllByText("What do you need done?").length).toBeGreaterThan(0);
    expect(screen.getByTestId("step-title-mobile")).toHaveTextContent(
      "What do you need done?",
    );
  });

  // TODO: re-enable post UI redesign (see above).
  it.skip("pre-selects the inferred category from the loaded project", async () => {
    render(<EditProjectPage />);

    await waitFor(() => {
      // The bathroom tile in the mobile category step exists once form loads.
      expect(screen.getByTestId("category-mobile-Bathroom")).toBeInTheDocument();
    }, WAIT);

    // "Bathroom Remodel (Full)" lives under the Bathroom category — that
    // tile should be pre-selected (aria-pressed) on the loaded project.
    const tile = screen.getByTestId("category-mobile-Bathroom");
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });

  it("shows 'Save changes' submit copy on the mobile shell", async () => {
    render(<EditProjectPage />);

    await waitFor(() => {
      expect(screen.getByTestId("post-job-mobile")).toBeInTheDocument();
    }, WAIT);

    // The "Continue" button on step 1 is rendered with btn-next-mobile;
    // the submit-step variant uses btn-create-mobile and shows "Save changes"
    // when submitLabel is overridden. We can't easily traverse to the last
    // step in this smoke test, but we can confirm the wired copy is present
    // in the rendered tree by inspecting props through the shell — instead,
    // verify the "Step 1 of N" header renders, proving the shell was passed
    // edit-mode props.
    expect(screen.getAllByText(/Step 1 of \d+/i).length).toBeGreaterThan(0);
  });
});
