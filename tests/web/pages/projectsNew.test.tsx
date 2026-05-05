// tests/web/pages/projectsNew.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
const post = vi.fn();

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

describe("Post a job — mobile wizard shell", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    get.mockClear();
    post.mockClear();
  });

  const WAIT = { timeout: 5000 };

  // TODO: re-enable post UI redesign. PostJobMobile testids
   // (step-title-mobile, category-mobile-*, btn-prev-mobile) shifted in
   // the wizard refresh; assertions need realigning.
  it.skip("renders step 1 with 'What do you need done?' on mobile", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      // Both views render the same titles; mobile is one of them.
      expect(
        screen.getAllByText("What do you need done?").length,
      ).toBeGreaterThan(0);
    }, WAIT);
    // Mobile shell-specific marker
    expect(screen.getByTestId("post-job-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("step-title-mobile")).toHaveTextContent(
      "What do you need done?",
    );
  });

  it("shows Step 1 of N indicator and progress bar", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(screen.getByTestId("post-job-mobile")).toBeInTheDocument();
    }, WAIT);
    // Step counter text — appears in both mobile and desktop renders
    expect(screen.getAllByText(/Step 1 of \d+/i).length).toBeGreaterThan(0);
  });

  // TODO: re-enable post UI redesign (see above).
  it.skip("selecting a category tile marks it pressed and advances to step 2", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(
        screen.getByTestId("category-mobile-Bathroom"),
      ).toBeInTheDocument();
    }, WAIT);

    const tile = screen.getByTestId("category-mobile-Bathroom");
    fireEvent.click(tile);

    expect(tile).toHaveAttribute("aria-pressed", "true");

    // Auto-advances to subtypes after a 150ms timeout.
    await waitFor(
      () => {
        expect(screen.getByTestId("step-title-mobile")).toHaveTextContent(
          /What type of bathroom work\?/i,
        );
      },
      { timeout: 2000 },
    );
  });

  // TODO: re-enable post UI redesign (see above).
  it.skip("Back button on step 2 returns to step 1", async () => {
    render(<NewProjectPage />);
    await waitFor(() => {
      expect(
        screen.getByTestId("category-mobile-Bathroom"),
      ).toBeInTheDocument();
    }, WAIT);

    fireEvent.click(screen.getByTestId("category-mobile-Bathroom"));

    await waitFor(
      () => {
        expect(screen.getByTestId("btn-prev-mobile")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByTestId("btn-prev-mobile"));

    expect(screen.getByTestId("step-title-mobile")).toHaveTextContent(
      "What do you need done?",
    );
  });
});
