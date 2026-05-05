// tests/web/components/OwnerProjectView.test.tsx
//
// Smoke tests for the homeowner project page driver. The component is
// a 540-line integration of ~10 child components - exhaustive testing
// belongs in Playwright e2e. These tests cover:
//   - The page mounts cleanly with a minimal VM
//   - The Close Job action wires to onCloseProject
//   - The Edit link points at the right route
//   - Get-recommendations button opens the modal
//   - The Close Job button is hidden when isClosed is true
//
// Heavy children (ShortlistSection, HiredTradesmenSection, SpotlightStrip,
// SharedTradesmen, VettedBusinessesStrip, ScrollReveal) are stubbed to
// noops - they have their own dedicated tests.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// API mock - the component fires per-rec verification fetches and a
// /api/projects/:id/hires fetch on mount. Return empty payloads.
const get = vi.fn(async () => ({ data: { items: [] } }));
const apiInstance = { get, post: vi.fn() };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/projects/[id]",
    asPath: "/projects/7",
    query: { id: "7" },
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

// Heavy children - each has its own dedicated test file. Stub to keep
// this test focused on the OwnerProjectView wiring itself.
vi.mock("@/components/project/ShortlistSection", () => ({ default: () => null }));
vi.mock("@/components/project/HiredTradesmenSection", () => ({ default: () => null }));
vi.mock("@/components/project/HireConfirmModal", () => ({ default: () => null }));
vi.mock("@/components/project/SharedTradesmen", () => ({ default: () => null }));
vi.mock("@/components/project/VettedBusinessesStrip", () => ({ default: () => null }));
vi.mock("@/components/tradesmen/SpotlightStrip", () => ({ default: () => null }));
vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/components/project/PriceRangeBadge", () => ({ default: () => null }));
vi.mock("@/components/StatusBadge", () => ({
  default: ({ value }: any) => <span>Status: {String(value)}</span>,
}));
// GetRecommendationsModal: lightweight stub that exposes whether it is
// "open" so we can assert the open-modal click path works.
vi.mock("@/components/project/GetRecommendationsModal", () => ({
  __esModule: true,
  default: ({ open }: any) =>
    open ? <div data-testid="stub-get-recs-modal">open</div> : null,
}));

import OwnerProjectView from "@/components/project/views/OwnerProjectView";

function makeVm(overrides: Partial<any> = {}) {
  return {
    project: {
      id: 7,
      name: "Loft conversion",
      type: "Loft Conversion",
      location: "E4",
      status: "live",
      ownerUserId: "u1",
      createdAt: "2026-05-04T10:00:00Z",
      isMine: true,
      isOwner: true,
      isTrades: false,
    },
    backHref: "/projects",
    isClosed: false,
    onCloseProject: vi.fn(),
    recs: [],
    recTotal: 0,
    recsErr: null,
    setFlash: vi.fn(),
    classification: null,
    ...overrides,
  };
}

describe("<OwnerProjectView />", () => {
  beforeEach(() => {
    get.mockClear();
  });

  it("mounts cleanly with a minimal VM and shows the title", () => {
    const vm = makeVm();
    render(<OwnerProjectView vm={vm as any} />);
    // Header title falls back to project.type when set (the component
    // intentionally prefers type over name as the H1 label).
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Loft Conversion",
    );
    expect(screen.getByTestId("owner-actions-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("owner-actions-primary")).toBeInTheDocument();
  });

  it("Close Job button fires onCloseProject", () => {
    const onCloseProject = vi.fn();
    const vm = makeVm({ onCloseProject });
    render(<OwnerProjectView vm={vm as any} />);
    fireEvent.click(screen.getByTestId("btn-close-project"));
    expect(onCloseProject).toHaveBeenCalledTimes(1);
  });

  it("Edit link points at /projects/:id/edit", () => {
    render(<OwnerProjectView vm={makeVm() as any} />);
    expect(screen.getByTestId("btn-edit")).toHaveAttribute(
      "href",
      "/projects/7/edit",
    );
  });

  it("Share-with-friends button opens GetRecommendationsModal", () => {
    render(<OwnerProjectView vm={makeVm() as any} />);
    expect(screen.queryByTestId("stub-get-recs-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("btn-get-recs"));
    expect(screen.getByTestId("stub-get-recs-modal")).toBeInTheDocument();
  });

  it("hides the Close Job + Edit + Get-recs CTAs when the project is closed", () => {
    render(<OwnerProjectView vm={makeVm({ isClosed: true }) as any} />);
    expect(screen.queryByTestId("btn-close-project")).toBeNull();
    expect(screen.queryByTestId("btn-edit")).toBeNull();
    expect(screen.queryByTestId("owner-actions-primary")).toBeNull();
  });
});
