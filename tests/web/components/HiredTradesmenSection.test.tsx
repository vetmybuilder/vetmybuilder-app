// tests/web/components/HiredTradesmenSection.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const api = {
  get: vi.fn(),
  patch: vi.fn(),
};
vi.mock("@/utils/api", () => ({
  useApi: () => api,
}));

import HiredTradesmenSection from "../../../web/components/project/HiredTradesmenSection";

function aHire(overrides: any = {}) {
  return {
    id: 17,
    projectId: 4,
    tradesmanUserId: "tm-abc",
    recommendationId: null,
    status: "pending",
    homeownerMessage: null,
    tradesmanMessage: null,
    cancelReason: null,
    hiredAt: new Date().toISOString(),
    respondedAt: null,
    cancelledAt: null,
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    displayName: "Elegant Building Services",
    tradesmanCompanyName: "Elegant Building Services",
    invitedCompanyName: null,
    inviteChannel: null,
    tradesmanAvatarUrl: null,
    ...overrides,
  };
}

describe("<HiredTradesmenSection />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state while fetching", () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    render(<HiredTradesmenSection projectId={4} />);

    expect(
      screen.getByTestId("hired-tradesmen-loading"),
    ).toBeInTheDocument();
  });

  it("renders nothing when there are no hires (empty section is too noisy on a fresh project)", async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } });

    const { container } = render(<HiredTradesmenSection projectId={4} />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("hired-tradesmen-loading"),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("hired-tradesmen-section"),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single pending hire with the cancel button", async () => {
    api.get.mockResolvedValue({
      data: { items: [aHire()], total: 1 },
    });

    render(<HiredTradesmenSection projectId={4} />);

    expect(
      await screen.findByTestId("hired-tradesman-17"),
    ).toBeInTheDocument();
    expect(screen.getByText("Elegant Building Services")).toBeInTheDocument();
    expect(screen.getByText(/Awaiting response/i)).toBeInTheDocument();
    expect(screen.getByTestId("hired-tradesman-cancel-17")).toBeInTheDocument();
  });

  it("does not render a cancel button on a terminal-state hire", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [aHire({ id: 17, status: "declined" })],
        total: 1,
      },
    });

    render(<HiredTradesmenSection projectId={4} />);

    await screen.findByTestId("hired-tradesman-17");
    expect(
      screen.queryByTestId("hired-tradesman-cancel-17"),
    ).not.toBeInTheDocument();
  });

  it("cancelling a pending hire calls the cancel endpoint with no reason and refetches", async () => {
    api.get
      .mockResolvedValueOnce({
        data: { items: [aHire({ status: "pending" })], total: 1 },
      })
      .mockResolvedValueOnce({
        data: {
          items: [aHire({ status: "cancelled" })],
          total: 1,
        },
      });
    api.patch.mockResolvedValue({ data: { ok: true } });

    render(<HiredTradesmenSection projectId={4} />);

    fireEvent.click(await screen.findByTestId("hired-tradesman-cancel-17"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/hires/17/cancel", {});
      // refetch happened
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  it("cancelling an accepted hire opens the modal and submits the chosen reason", async () => {
    api.get
      .mockResolvedValueOnce({
        data: { items: [aHire({ status: "accepted" })], total: 1 },
      })
      .mockResolvedValueOnce({
        data: { items: [aHire({ status: "cancelled" })], total: 1 },
      });
    api.patch.mockResolvedValue({ data: { ok: true } });

    render(<HiredTradesmenSection projectId={4} />);

    fireEvent.click(await screen.findByTestId("hired-tradesman-cancel-17"));

    // Modal should open
    expect(
      await screen.findByTestId("cancel-hire-modal"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("cancel-hire-reason"), {
      target: { value: "changed_mind" },
    });
    fireEvent.click(screen.getByTestId("cancel-hire-submit"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/hires/17/cancel", {
        cancelReason: "changed_mind",
      });
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  it("refetches when the refreshKey prop changes", async () => {
    api.get.mockResolvedValue({ data: { items: [aHire()], total: 1 } });

    const { rerender } = render(
      <HiredTradesmenSection projectId={4} refreshKey={0} />,
    );

    await screen.findByTestId("hired-tradesman-17");
    expect(api.get).toHaveBeenCalledTimes(1);

    rerender(<HiredTradesmenSection projectId={4} refreshKey={1} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the invite-channel-aware label for pending_invite hires", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          aHire({
            id: 17,
            status: "pending_invite",
            tradesmanUserId: null,
            recommendationId: 99,
            inviteChannel: "email",
          }),
        ],
        total: 1,
      },
    });

    render(<HiredTradesmenSection projectId={4} />);

    expect(await screen.findByText(/Invite sent/i)).toBeInTheDocument();
  });

  it("shows 'Awaiting outreach' when pending_invite has no channel", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          aHire({
            id: 17,
            status: "pending_invite",
            tradesmanUserId: null,
            recommendationId: 99,
            inviteChannel: "manual",
          }),
        ],
        total: 1,
      },
    });

    render(<HiredTradesmenSection projectId={4} />);

    expect(await screen.findByText(/Awaiting outreach/i)).toBeInTheDocument();
  });

  it("shows an error banner when the fetch fails", async () => {
    api.get.mockRejectedValue({ message: "Boom" });

    render(<HiredTradesmenSection projectId={4} />);

    expect(
      await screen.findByTestId("hired-tradesmen-error"),
    ).toHaveTextContent("Boom");
  });
});
