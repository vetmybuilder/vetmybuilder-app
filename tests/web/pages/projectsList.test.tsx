// tests/web/pages/projectsList.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// jsdom doesn't ship IntersectionObserver — stub a no-op.
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

const MINE_ITEMS = [
  {
    id: 1,
    name: "Bathroom fitting",
    type: "bathroom",
    status: "live",
    location: "E4 6AB",
    propertyType: "House",
    bedrooms: 3,
    createdAt: "2026-04-01T00:00:00Z",
    coverPhotoUrl: null,
    // S1 / S3 — in-app nudge counts. 5 trades have right-swiped this
    // job and 2 of those paid for priority placement. The rendering
    // shows "5 interested" + "2 priority" pills alongside the existing
    // "msgs" / "matches" pills.
    interestCount: 5,
    paidPriorityCount: 2,
  },
  {
    id: 2,
    name: "Kitchen extension",
    type: "kitchen",
    status: "pending",
    location: "E4",
    propertyType: "House",
    bedrooms: 4,
    createdAt: "2026-04-02T00:00:00Z",
    coverPhotoUrl: null,
    interestCount: 0,
    paidPriorityCount: 0,
  },
  {
    id: 3,
    name: "Loft conversion",
    type: "loft",
    status: "live",
    location: "E4",
    propertyType: "House",
    bedrooms: 3,
    createdAt: "2026-04-03T00:00:00Z",
    coverPhotoUrl: null,
    // Singular-pluralisation case: counts of exactly 1 should render
    // as "1 interest" / "1 match", not "1 interests" / "1 matches".
    interestCount: 1,
    paidPriorityCount: 1,
    matchedCount: 1,
  },
];

const COMPLETED_ITEMS = [
  {
    id: 99,
    name: "Loft conversion",
    type: "loft",
    status: "completed",
    location: "E4 9XX",
    propertyType: "House",
    bedrooms: 3,
    createdAt: "2026-03-01T00:00:00Z",
    coverPhotoUrl: null,
  },
];

const get = vi.fn(async (url: string) => {
  if (url.includes("/api/tradesmen/me")) {
    return { data: { role: "homeowner", profile: null } };
  }
  if (url.includes("/api/projects")) {
    const items = url.includes("tab=completed") ? COMPLETED_ITEMS : MINE_ITEMS;
    return {
      data: {
        items,
        total: items.length,
        page: 1,
        pageSize: 12,
      },
    };
  }
  return { data: {} };
});

vi.mock("@/utils/api", () => ({ useApi: () => ({ get, post: vi.fn() }) }));

vi.mock("@/utils/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    loading: false,
    profileComplete: true,
    ensureSignedIn: vi.fn(),
  }),
}));

const push = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: "/projects",
    asPath: "/projects",
    push,
    replace: vi.fn(),
  }),
}));

// Stub Layout so we don't pull in SiteHeader / Firebase / etc.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout-wrap">{children}</div>
  ),
}));

import ProjectsPage from "@/pages/projects";

describe("Projects list (mobile + desktop)", () => {
  beforeEach(() => {
    push.mockClear();
    sessionStorage.clear();
  });

  // Generous timeout — full web suite runs many tests in parallel and CPU
  // contention can make the initial /api/projects roundtrip take >1s.
  const WAIT = { timeout: 5000 };

  it("renders project cards from /api/projects", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      // Desktop and mobile both render the same names; expect at least one match.
      expect(screen.getAllByText("Bathroom fitting").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Kitchen extension").length).toBeGreaterThan(0);
    }, WAIT);
  });

  it("renders type / sort filter chips with default labels", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Bathroom fitting").length).toBeGreaterThan(0);
    }, WAIT);

    expect(screen.getByTestId("chip-type")).toHaveTextContent(/Type/);
    expect(screen.getByTestId("chip-sort")).toHaveTextContent(/Newest first/);
  });

  it("renders the Post a Job FAB", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("projects-mobile-fab")).toBeInTheDocument();
    }, WAIT);
    expect(screen.getByTestId("projects-mobile-fab")).toHaveTextContent(
      /Post a Job/i,
    );
  });

  it("doesn't render the All / Live tab strip on mobile (count pill replaces it)", async () => {
    // The /projects mobile view only ever surfaces live jobs - the
    // All vs Live distinction was redundant because draft + completed
    // surfaces don't exist post-CR3. The tab row was removed and a
    // small "{N} live" pill next to the "My jobs" title carries the
    // count instead.
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("projects-mobile-fab")).toBeInTheDocument();
    }, WAIT);
    expect(screen.queryByTestId("projects-mobile-tabs")).not.toBeInTheDocument();
  });

  // (Mobile Completed-tab behaviour is covered by the Playwright e2e
  // suite — testing it here would duplicate that coverage AND hangs the
  // jsdom render after the click.)

  // S1: silent in-app nudge. When trades right-swipe a homeowner's
  // project we don't push a bell notification (anti-spam), but the
  // project row on the homeowner's /projects list grows a single amber
  // "N interests" pill counting all pending right-swipes (subscribed +
  // paid_unlock + recommended) where the homeowner hasn't reciprocated
  // yet. The paid_unlock subset doesn't surface as a separate pill on
  // this list view — that distinction is only useful once the homeowner
  // opens the shortlist, where the "Wants this job" boost badge already
  // shows it.
  it("renders the interests pill when the project has pending interest", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Bathroom fitting").length).toBeGreaterThan(0);
    }, WAIT);

    // Bathroom fitting has interestCount=5.
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/interests/i).length).toBeGreaterThan(0);
  });

  it("does not render a separate priority pill on the projects list", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Bathroom fitting").length).toBeGreaterThan(0);
    }, WAIT);

    // The PRIORITY pill was retired from the list view. Loft conversion
    // (interestCount=3, paidPriorityCount=3) and Bathroom fitting
    // (paidPriorityCount=2) should NOT surface any "priority" label on
    // this page.
    expect(screen.queryAllByText(/priority/i).length).toBe(0);
  });

  it("pluralises pill labels correctly for count==1 (interest, match) and count>1 (interests, matches)", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Loft conversion").length).toBeGreaterThan(0);
    }, WAIT);

    // Loft conversion has count 1 across the board → singular labels.
    // We use exact string match on the rendered label text.
    expect(screen.getAllByText("interest").length).toBeGreaterThan(0);
    expect(screen.getAllByText("match").length).toBeGreaterThan(0);

    // Bathroom fitting has interestCount=5 → plural label still
    // renders for the higher-count row.
    expect(screen.getAllByText("interests").length).toBeGreaterThan(0);
  });

  it("hides the interests pill when interestCount is zero", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Kitchen extension").length).toBeGreaterThan(0);
    }, WAIT);

    // Kitchen extension has interestCount=0. No "interests" pill should
    // appear in its row. Other rows may still render their own pills, so
    // we walk up from the Kitchen extension text node and check the
    // immediate row ancestry for a zero-count pill specifically.
    const kitchenRows = screen.getAllByText("Kitchen extension");
    for (const node of kitchenRows) {
      let cur: HTMLElement | null = node as HTMLElement;
      while (cur && cur.parentElement) {
        cur = cur.parentElement;
        const txt = cur.textContent || "";
        if (txt.includes("Bathroom fitting") || txt.includes("Loft conversion")) break;
        if (/0\s*interests/i.test(txt)) {
          throw new Error(
            "Found zero-count interests pill inside the Kitchen extension row",
          );
        }
      }
    }
  });
});
