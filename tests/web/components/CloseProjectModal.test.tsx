// tests/web/components/CloseProjectModal.test.tsx
//
// Covers the close-project flow gap that desktop hit in May 2026: a project
// that has matched tradespeople (but no recommendations or shared profiles)
// could not be closed because the dropdown only sourced recs + shares.
//
// We assert:
//   1. Matched tradespeople from /api/projects/:id/matched-tradespeople appear
//      as selectable options in the custom popover dropdown.
//   2. Picking "Someone else" submits with winnerOther: true so the server
//      marks the project completed (rather than archived) even though no
//      specific winner uid is sent.
//   3. Choosing a matched tradesperson submits with winnerTradesmanUid.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const matchedRows = [
  { tradesmanUid: "ghost-uid-1", companyName: "Northside Plumbing", tradesmanName: "Aisha" },
];

const get = vi.fn(async (url: string) => {
  if (url.startsWith("/api/recommendations/ratings")) return { data: { items: [] } };
  if (url.startsWith("/api/tradesmen/shares")) return { data: { shares: [] } };
  if (url.includes("/matched-tradespeople")) return { data: { matches: matchedRows } };
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));

const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({
  useApi: () => apiInstance,
}));

// FileGridUploader pulls in image-handling deps we don't need here; stub it
// out so the modal mounts cleanly under jsdom.
vi.mock("@/components/fileUpload/FileGridUploader", () => ({
  default: () => <div data-testid="stub-file-uploader" />,
}));

import CloseProjectModal from "@/components/CloseProjectModal";

describe("<CloseProjectModal /> (desktop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/recommendations/ratings"))
        return { data: { items: [] } };
      if (url.startsWith("/api/tradesmen/shares"))
        return { data: { shares: [] } };
      if (url.includes("/matched-tradespeople"))
        return { data: { matches: matchedRows } };
      return { data: {} };
    });
  });

  it("lists matched tradespeople in the dropdown and submits winnerTradesmanUid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <CloseProjectModal
        projectId={10}
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    // Wait for matched-tradespeople fetch to land in the dropdown.
    const dropdownBtn = await screen.findByTestId("close-who-button");
    fireEvent.click(dropdownBtn);
    const list = await screen.findByTestId("close-who-listbox");

    await waitFor(() => {
      expect(within(list).getByText(/Northside Plumbing/)).toBeInTheDocument();
    });

    fireEvent.click(within(list).getByText(/Northside Plumbing/));

    fireEvent.click(screen.getByTestId("btn-confirm-close"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.didGoAhead).toBe(true);
    expect(payload.winnerTradesmanUid).toBe("ghost-uid-1");
    expect(payload.winnerOther).toBeUndefined();
  });

  it("picking 'Someone else' from the dropdown submits winnerOther", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <CloseProjectModal
        projectId={10}
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(await screen.findByTestId("close-who-button"));
    const list = await screen.findByTestId("close-who-listbox");
    fireEvent.click(within(list).getByText(/Someone else/i));

    fireEvent.click(screen.getByTestId("btn-confirm-close"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.didGoAhead).toBe(true);
    expect(payload.winnerOther).toBe(true);
    expect(payload.winnerTradesmanUid).toBeUndefined();
    expect(payload.selectedRecommendationId).toBeUndefined();
  });

  it("offers 'Someone else' even when no candidates have loaded", async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/recommendations/ratings"))
        return { data: { items: [] } };
      if (url.startsWith("/api/tradesmen/shares"))
        return { data: { shares: [] } };
      if (url.includes("/matched-tradespeople"))
        return { data: { matches: [] } };
      return { data: {} };
    });

    render(
      <CloseProjectModal
        projectId={10}
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("close-who-button"));
    const list = await screen.findByTestId("close-who-listbox");
    expect(within(list).getByText(/Someone else/i)).toBeInTheDocument();
  });
});
