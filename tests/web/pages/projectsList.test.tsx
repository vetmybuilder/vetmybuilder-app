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

  it("renders only the All / Live pills on mobile (Drafts + Completed are gone)", async () => {
    // Completed projects have no homeowner-facing surface post-CR3 -
    // the closure → archive flow makes the Completed tab redundant, so
    // the mobile pill row was stripped to just All + Live.
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("projects-mobile-tabs")).toBeInTheDocument();
    }, WAIT);
    const tabs = screen.getByTestId("projects-mobile-tabs");
    expect(tabs).not.toHaveTextContent(/Drafts/);
    expect(tabs).not.toHaveTextContent(/Completed/);
    expect(tabs).toHaveTextContent(/All/);
    expect(tabs).toHaveTextContent(/Live/);
  });

  // (Mobile Completed-tab behaviour is covered by the Playwright e2e
  // suite — testing it here would duplicate that coverage AND hangs the
  // jsdom render after the click.)
});
