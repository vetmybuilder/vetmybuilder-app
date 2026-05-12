// tests/web/components/TradesmanManageTab.test.tsx
//
// Admin-side actions panel inside TradesmanDetailDrawer:
//   - Status (active / draft / inactive)
//   - Subscription grant / revoke / cancel
//   - One-off unlocks (grant per project id)
//
// These are mutation endpoints we don't want to silently break - each
// path here corresponds to a real bell-curve admin operation. We assert
// each mutation hits the right URL with the right payload and the
// onRefresh callback fires so the parent leaderboard reloads.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
const post = vi.fn();
const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

import TradesmanManageTab from "@/components/admin/TradesmanManageTab";

const baseProps = {
  uid: "u-1",
  currentStatus: "active",
  currentPlan: "free",
  onRefresh: vi.fn(),
};

describe("<TradesmanManageTab />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The mount-time fetch is the existing-unlocks load. Most tests
    // don't care about the result; return [] so the list renders empty.
    get.mockResolvedValue({ data: { items: [] } });
    post.mockResolvedValue({ data: { ok: true } });
  });

  it("loads existing unlocks on mount", async () => {
    render(<TradesmanManageTab {...baseProps} onRefresh={vi.fn()} />);

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        "/api/admin/tradesmen/u-1/oneoff-unlocks",
      );
    });
  });

  it("POSTs a status change with the right payload + calls onRefresh", async () => {
    const onRefresh = vi.fn();
    render(<TradesmanManageTab {...baseProps} onRefresh={onRefresh} />);

    // Wait for the initial unlocks fetch so the panel finishes mounting.
    await waitFor(() => expect(get).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("manage-status-inactive"));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/api/admin/tradesmen/u-1/status",
        expect.objectContaining({ status: "inactive" }),
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("POSTs a subscription grant with the selected tier", async () => {
    const onRefresh = vi.fn();
    render(<TradesmanManageTab {...baseProps} onRefresh={onRefresh} />);
    await waitFor(() => expect(get).toHaveBeenCalled());

    // Default tier is "month_1"; click Grant without changing the select.
    fireEvent.click(screen.getByTestId("manage-sub-grant"));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/api/admin/builder-subscriptions/grant",
        expect.objectContaining({ userId: "u-1", tier: "month_1" }),
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it("POSTs an unlock grant with a numeric projectId + refetches the list", async () => {
    const onRefresh = vi.fn();
    render(<TradesmanManageTab {...baseProps} onRefresh={onRefresh} />);
    await waitFor(() => expect(get).toHaveBeenCalled());

    // After the unlock POST succeeds the component refetches the
    // unlocks list, so we'll see TWO GETs in total.
    get.mockClear();
    get.mockResolvedValueOnce({
      data: {
        items: [
          {
            projectId: 42,
            projectName: "Loft conversion",
            status: "active",
            approvedAt: "2026-05-12T00:00:00Z",
          },
        ],
      },
    });

    fireEvent.change(screen.getByTestId("manage-unlock-project-id"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByTestId("manage-unlock-grant"));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/api/admin/tradesmen/u-1/oneoff-unlocks/grant",
        { projectId: 42 },
      );
    });
    // Refetch after grant
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        "/api/admin/tradesmen/u-1/oneoff-unlocks",
      );
    });
  });

  it("rejects a non-numeric project id without firing the POST", async () => {
    const onRefresh = vi.fn();
    render(<TradesmanManageTab {...baseProps} onRefresh={onRefresh} />);
    await waitFor(() => expect(get).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("manage-unlock-project-id"), {
      target: { value: "abc" },
    });

    post.mockClear();
    fireEvent.click(screen.getByTestId("manage-unlock-grant"));

    // No POST should fire for a non-numeric id. Give the handler a beat
    // to settle in case it queued the fetch.
    await new Promise((r) => setTimeout(r, 30));
    expect(post).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
