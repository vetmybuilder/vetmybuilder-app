// tests/web/components/TradesmanDetailDrawer.test.tsx
//
// Right-side drawer rendered when an admin clicks "View" on a tradesman
// in /admin/tradesmen-leaderboard. Covers the high-value behaviours an
// admin actually relies on:
//   - Renders nothing when no item is selected.
//   - Renders header + 6 tabs when an item is supplied.
//   - Clicking a tab swaps the panel.
//   - Docs tab lazy-loads /api/admin/tradesmen/:uid/docs on open and
//     renders the rows.
//   - "Mark verified" PATCHes the right endpoint with `{ verified: true }`.
//   - Scrim and X both call onClose.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
const patch = vi.fn();
const post = vi.fn();
const apiInstance = { get, patch, post };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

// Manage tab is the heaviest child - we exercise it in its own test
// file. Stub here so this drawer's specs don't have to mock its fetches.
vi.mock("@/components/admin/TradesmanManageTab", () => ({
  default: () => <div data-testid="manage-tab-stub" />,
}));

import TradesmanDetailDrawer, {
  type LeaderboardItem,
} from "@/components/admin/TradesmanDetailDrawer";

const baseItem: LeaderboardItem = {
  userId: "u-1",
  company: "Northside Plumbing",
  status: "active",
  score: 87.3,
  companyNumber: "12345678",
  chStatus: "verified",
  webVerified: true,
  website: "https://example.com",
  trades: "Plumbing,Tiling",
  areas: "E4,N17",
  photos: 4,
  docs: 2,
  likes: 5,
  wins: 2,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  plan: "free",
  warrantyMonths: 12,
};

describe("<TradesmanDetailDrawer />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default docs response - empty so the initial render doesn't blow
    // up when a test hops to the Docs tab without setting its own mock.
    get.mockResolvedValue({ data: { docs: [] } });
  });

  it("renders nothing when item is null", () => {
    const { container } = render(
      <TradesmanDetailDrawer item={null} onClose={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="tradesman-detail-drawer"]')).toBeNull();
  });

  it("renders the header + tabs when an item is supplied", () => {
    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);

    expect(screen.getByText("Northside Plumbing")).toBeInTheDocument();
    expect(screen.getByText("87.3")).toBeInTheDocument();

    // All six tabs render. The Docs/Photos tabs include a live count in
    // their labels; assert the testid exists rather than coupling to the
    // exact string.
    for (const tab of ["overview", "docs", "photos", "trades", "activity", "manage"]) {
      expect(screen.getByTestId(`drawer-tab-${tab}`)).toBeInTheDocument();
    }
  });

  it("switches panels when a tab is clicked", () => {
    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);

    // Manage tab swap: clicking the Manage tab should mount the
    // (stubbed) TradesmanManageTab child.
    fireEvent.click(screen.getByTestId("drawer-tab-manage"));
    expect(screen.getByTestId("manage-tab-stub")).toBeInTheDocument();
  });

  it("lazy-loads docs only when the Docs tab is opened", async () => {
    get.mockResolvedValueOnce({
      data: {
        docs: [
          {
            type: "public_liability",
            label: "Public liability insurance",
            customType: null,
            fileName: "policy.pdf",
            fileKey: "u-1/public_liability.pdf",
            fileUrl: null,
            verified: false,
            verifiedAt: null,
            verifiedBy: null,
          },
        ],
      },
    });

    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);

    // No fetch on initial mount - only when Docs is selected.
    expect(get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("drawer-tab-docs"));

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        "/api/admin/tradesmen/u-1/docs",
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/policy\.pdf/)).toBeInTheDocument();
    });
  });

  it("calls PATCH when 'Mark verified' is clicked", async () => {
    get.mockResolvedValueOnce({
      data: {
        docs: [
          {
            type: "public_liability",
            label: "Public liability insurance",
            customType: null,
            fileName: "policy.pdf",
            fileKey: "u-1/public_liability.pdf",
            fileUrl: null,
            verified: false,
            verifiedAt: null,
            verifiedBy: null,
          },
        ],
      },
    });
    patch.mockResolvedValueOnce({
      data: {
        ok: true,
        // The handler replaces the row with `data.doc`, so the response
        // must be the full DocEntry shape - not just a verified flag.
        doc: {
          type: "public_liability",
          label: "Public liability insurance",
          customType: null,
          fileName: "policy.pdf",
          fileKey: "u-1/public_liability.pdf",
          fileUrl: null,
          verified: true,
          verifiedAt: "2026-05-12T00:00:00Z",
          verifiedBy: "admin-1",
        },
      },
    });

    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("drawer-tab-docs"));

    const verifyBtn = await screen.findByRole("button", {
      name: /mark verified/i,
    });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        "/api/admin/tradesmen/u-1/docs/0",
        { verified: true },
      );
    });
  });

  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    render(<TradesmanDetailDrawer item={baseItem} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the scrim is clicked", () => {
    const onClose = vi.fn();
    render(<TradesmanDetailDrawer item={baseItem} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Close drawer"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
