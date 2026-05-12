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
    // URL-aware default. The drawer fetches docs on mount; tabs that
    // exercise photos/activity fetch on tab open. Each test can still
    // override with mockResolvedValueOnce (which takes precedence over
    // the implementation) for its specific case.
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) return { data: { docs: [] } };
      if (url.endsWith("/photos")) return { data: { photos: [] } };
      if (url.endsWith("/activity")) {
        return {
          data: { events: [], profile: { createdAt: null, updatedAt: null } },
        };
      }
      return { data: {} };
    });
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

  it("loads docs eagerly on drawer open so Overview can show the verified count", async () => {
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

    // Docs fetch fires on mount so the Overview tab's
    // "Docs admin-reviewed (X/N)" panel renders the right number
    // without having to wait for the user to visit the Docs tab.
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith("/api/admin/tradesmen/u-1/docs");
    });

    fireEvent.click(screen.getByTestId("drawer-tab-docs"));

    await waitFor(() => {
      expect(screen.getByText(/policy\.pdf/)).toBeInTheDocument();
    });
  });

  it("calls PATCH when 'Mark verified' is clicked", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs"))
        return {
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
        };
      return { data: {} };
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

  it("lazy-loads photos when the Photos tab is opened", async () => {
    // Two distinct mock responses: docs fire eagerly on drawer mount,
    // photos fire only when the user clicks into the tab.
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) return { data: { docs: [] } };
      if (url.endsWith("/photos")) {
        return {
          data: {
            photos: [
              { id: 1, url: "/uploads/p1.jpg", sortOrder: 0 },
              { id: 2, url: "/uploads/p2.jpg", sortOrder: 1 },
            ],
          },
        };
      }
      return { data: {} };
    });

    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);

    // Docs URL fires on mount; photos must NOT fire until the tab opens.
    await waitFor(() => {
      expect(
        get.mock.calls.some((c) => String(c[0]).endsWith("/docs")),
      ).toBe(true);
    });
    expect(
      get.mock.calls.some((c) => String(c[0]).endsWith("/photos")),
    ).toBe(false);

    fireEvent.click(screen.getByTestId("drawer-tab-photos"));

    await waitFor(() => {
      expect(
        get.mock.calls.some((c) => String(c[0]).endsWith("/photos")),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("drawer-photos")).toBeInTheDocument();
    });
  });

  it("shows an empty state on the Photos tab when no photos are returned", async () => {
    get.mockResolvedValueOnce({ data: { photos: [] } });

    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("drawer-tab-photos"));

    await waitFor(() => {
      expect(screen.getByTestId("drawer-photos-empty")).toBeInTheDocument();
    });
  });

  it("Activity tab fetches the audit feed and renders events", async () => {
    // URL-aware override: docs (eager) gets the default empty response;
    // activity (lazy-on-tab) returns one canned event.
    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/docs")) return { data: { docs: [] } };
      if (url.endsWith("/activity")) {
        return {
          data: {
            events: [
              {
                id: 99,
                action: "status_change",
                actorUid: "admin-1",
                details: { status: "inactive" },
                createdAt: "2026-05-12T12:00:00Z",
              },
            ],
            profile: {
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-05-12T12:00:00Z",
            },
          },
        };
      }
      return { data: {} };
    });

    render(<TradesmanDetailDrawer item={baseItem} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("drawer-tab-activity"));

    await waitFor(() => {
      expect(
        get.mock.calls.some((c) =>
          String(c[0]).endsWith("/activity"),
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("drawer-activity-event-99"),
      ).toBeInTheDocument();
    });
    // The friendly label resolves "status_change" → "Status changed".
    expect(screen.getByText("Status changed")).toBeInTheDocument();
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
