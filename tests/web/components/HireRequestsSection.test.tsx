// tests/web/components/HireRequestsSection.test.tsx
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

import HireRequestsSection from "../../../web/components/tradesmen/HireRequestsSection";

function aHire(overrides: any = {}) {
  return {
    id: 1,
    projectId: 4,
    status: "pending",
    homeownerMessage: null,
    tradesmanMessage: null,
    hiredAt: new Date().toISOString(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    project: {
      id: 4,
      name: "Loft conversion",
      location: "E4",
      type: "Carpentry",
      propertyType: "Terraced house",
      bedrooms: 3,
      ownerFirstName: "Sarah",
      completedProjectsCount: 2,
    },
    ...overrides,
  };
}

describe("<HireRequestsSection />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state while fetching", () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    render(<HireRequestsSection />);

    expect(screen.getByTestId("hire-requests-loading")).toBeInTheDocument();
  });

  it("shows the empty state when there are no hires", async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } });

    render(<HireRequestsSection />);

    expect(
      await screen.findByTestId("hire-requests-empty"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No hire requests yet/i),
    ).toBeInTheDocument();
  });

  it("shows an error banner when the API call fails", async () => {
    api.get.mockRejectedValue({ message: "Network error" });

    render(<HireRequestsSection />);

    expect(
      await screen.findByTestId("hire-requests-error"),
    ).toHaveTextContent("Network error");
  });

  it("renders pending and accepted hires under the Active tab and shows the count badge", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          aHire({ id: 1, status: "pending" }),
          aHire({ id: 2, status: "accepted" }),
          aHire({ id: 3, status: "declined" }),
        ],
        total: 3,
      },
    });

    render(<HireRequestsSection />);

    // Active count badge shows 2 (pending + accepted)
    expect(
      await screen.findByTestId("hire-requests-active-count"),
    ).toHaveTextContent("2");

    // List shows the two active cards
    expect(screen.getByTestId("hire-request-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("hire-request-card-2")).toBeInTheDocument();
    expect(
      screen.queryByTestId("hire-request-card-3"),
    ).not.toBeInTheDocument();
  });

  it("clicking the Past tab shows declined / cancelled / expired hires", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          aHire({ id: 1, status: "pending" }),
          aHire({ id: 2, status: "declined" }),
          aHire({ id: 3, status: "cancelled" }),
          aHire({ id: 4, status: "expired" }),
        ],
        total: 4,
      },
    });

    render(<HireRequestsSection />);

    // Wait for initial render
    await screen.findByTestId("hire-request-card-1");

    fireEvent.click(screen.getByTestId("hire-requests-tab-past"));

    await waitFor(() => {
      expect(screen.getByTestId("hire-request-card-2")).toBeInTheDocument();
      expect(screen.getByTestId("hire-request-card-3")).toBeInTheDocument();
      expect(screen.getByTestId("hire-request-card-4")).toBeInTheDocument();
      expect(
        screen.queryByTestId("hire-request-card-1"),
      ).not.toBeInTheDocument();
    });
  });

  it("Past tab shows the empty state when there are no past hires", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [aHire({ id: 1, status: "pending" })],
        total: 1,
      },
    });

    render(<HireRequestsSection />);

    await screen.findByTestId("hire-request-card-1");

    fireEvent.click(screen.getByTestId("hire-requests-tab-past"));

    expect(
      await screen.findByText(/No past hire requests/i),
    ).toBeInTheDocument();
  });

  it("hides the active count badge when there are no active hires", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [aHire({ id: 1, status: "declined" })],
        total: 1,
      },
    });

    render(<HireRequestsSection />);

    await screen.findByTestId("hire-requests-empty");

    expect(
      screen.queryByTestId("hire-requests-active-count"),
    ).not.toBeInTheDocument();
  });
});
