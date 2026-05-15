// tests/web/pages/projectsNew.test.tsx
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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

// Mock matchMedia for responsive components.
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

const get = vi.fn(async (url: string) => {
  if (url.includes("/api/tradesmen/me")) {
    return { data: { role: "homeowner", profile: null } };
  }
  return { data: {} };
});
const post = vi.fn(async () => ({ data: { ok: true } }));

// The category step fetches /api/pilot/project-types via window.fetch to
// drive the "Coming soon" greying. Stub it so the picker behaves as it
// did pre-gating inside these tests - the wizard tests cover navigation,
// not the launch gate. Real gating behaviour is exercised in server-side
// gate specs + the admin-toggle integration paths.
//
// Returning a never-resolving promise keeps `pilotCategoryNames` null,
// which the picker treats as "loading: all categories live" - matching
// the pre-gating behaviour these tests were written against.
globalThis.fetch = vi.fn(() => new Promise(() => {})) as any;

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post }) }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/projects/new",
    asPath: "/projects/new",
    push,
    replace,
    back: vi.fn(),
  }),
}));

// Stub Layout so we don't pull SiteHeader / Firebase / etc.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout-wrap">{children}</div>
  ),
}));

// AuthedOnly is a passthrough in tests — render children unconditionally.
vi.mock("@/components/AuthedOnly", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import NewProjectPage from "@/pages/projects/new";
import { PROJECT_TYPES } from "@/types/projectTypes";

describe("Post a job - desktop wizard", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    get.mockClear();
    post.mockClear();
  });

  const WAIT = { timeout: 5000 };

  // The page renders both mobile and desktop trees in jsdom (no media
  // query gating). Component tests target the desktop wizard only -
  // mobile responsive coverage is owned by the Playwright e2e suite.
  // Scope all queries inside the desktop `wizard-new` wrapper.
  it("renders step 1 with the canonical title", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));
    expect(desktop.getByTestId("step-title")).toHaveTextContent(
      "What do you need done?",
    );
  });

  it("shows Step 1 of N indicator", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));
    expect(desktop.getByText(/Step 1 of \d+/i)).toBeInTheDocument();
  });

  it("selecting a category tile marks it pressed and advances to step 2", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));
    const tile = desktop.getByTestId("category-Bathroom");
    fireEvent.click(tile);

    expect(tile).toHaveAttribute("aria-pressed", "true");

    // Auto-advances to subtypes after a 150ms timeout.
    await waitFor(
      () => {
        expect(desktop.getByTestId("step-title")).toHaveTextContent(
          /What type of bathroom work\?/i,
        );
      },
      { timeout: 2000 },
    );
  });

  it("Back button on step 2 returns to step 1", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));
    fireEvent.click(desktop.getByTestId("category-Bathroom"));

    await waitFor(
      () => {
        expect(desktop.getByTestId("btn-prev")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    fireEvent.click(desktop.getByTestId("btn-prev"));

    expect(desktop.getByTestId("step-title")).toHaveTextContent(
      "What do you need done?",
    );
  });
});

describe("Post a job - launch gating on the category picker", () => {
  // Re-stub fetch to return a curated /api/pilot/project-types payload
  // for these tests so we can assert greying + click behaviour against
  // a known disabled category.
  const liveCategories = ["Bathroom", "Plumbing", "Electrical"];
  const liveTypes = PROJECT_TYPES.filter((c) =>
    liveCategories.includes(c.category),
  ).flatMap((c) =>
    c.types.map((t: string) => ({ typeName: t, category: c.category })),
  );

  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    get.mockClear();
    post.mockClear();
    globalThis.fetch = vi.fn(async (url: any) => {
      if (typeof url === "string" && url.includes("/api/pilot/project-types")) {
        return {
          ok: true,
          json: async () => ({
            types: liveTypes,
            categories: liveCategories,
          }),
        } as any;
      }
      // Demand-signal POSTs from the modal - resolve cheap so the
      // useEffect doesn't dangle.
      return { ok: true, json: async () => ({ ok: true }) } as any;
    }) as any;
  });

  const WAIT = { timeout: 5000 };

  it("renders a 'Coming soon' badge on disabled categories", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));

    // Bedroom is NOT in our live set -> should show the badge.
    await waitFor(() => {
      const tile = desktop.getByTestId("category-Bedroom");
      expect(tile).toHaveTextContent(/coming soon/i);
    }, WAIT);

    // Bathroom IS live -> no badge.
    const liveTile = desktop.getByTestId("category-Bathroom");
    expect(liveTile).not.toHaveTextContent(/coming soon/i);
  });

  it("clicking a disabled tile opens the ComingSoonSheet instead of advancing", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));

    // Wait for the pilot fetch to settle so isLive is populated.
    await waitFor(() => {
      expect(
        desktop.getByTestId("category-Bedroom"),
      ).toHaveTextContent(/coming soon/i);
    }, WAIT);

    fireEvent.click(desktop.getByTestId("category-Bedroom"));

    // Modal opened.
    await waitFor(() => {
      expect(screen.getByTestId("coming-soon-sheet")).toBeInTheDocument();
    }, WAIT);

    // Wizard step title is unchanged - the click did NOT advance.
    expect(desktop.getByTestId("step-title")).toHaveTextContent(
      "What do you need done?",
    );
  });

  it("clicking a live tile still advances normally", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("wizard-new")).toBeInTheDocument();
    }, WAIT);
    const desktop = within(screen.getByTestId("wizard-new"));

    // Wait for the picker to know what's live, else the click would
    // race with the gating state hydrating.
    await waitFor(() => {
      const tile = desktop.getByTestId("category-Bathroom");
      expect(tile).not.toHaveTextContent(/coming soon/i);
    }, WAIT);

    fireEvent.click(desktop.getByTestId("category-Bathroom"));

    await waitFor(
      () => {
        expect(desktop.getByTestId("step-title")).toHaveTextContent(
          /What type of bathroom work\?/i,
        );
      },
      { timeout: 2000 },
    );
  });
});
