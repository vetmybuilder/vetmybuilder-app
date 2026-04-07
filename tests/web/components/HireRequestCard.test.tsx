// tests/web/components/HireRequestCard.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ---- Mocks ----
const api = {
  patch: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock("@/utils/api", () => ({
  useApi: () => api,
}));

import HireRequestCard, {
  type HireRequest,
} from "../../../web/components/tradesmen/HireRequestCard";

function aHire(overrides: Partial<HireRequest> = {}): HireRequest {
  return {
    id: 17,
    projectId: 4,
    status: "pending",
    homeownerMessage: null,
    tradesmanMessage: null,
    hiredAt: new Date().toISOString(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

describe("<HireRequestCard />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders project context, homeowner trust signal, and message", () => {
    const hire = aHire({ homeownerMessage: "Available next week?" });

    render(<HireRequestCard hire={hire} />);

    expect(screen.getByText("Loft conversion")).toBeInTheDocument();
    expect(screen.getByText("Carpentry")).toBeInTheDocument();
    expect(screen.getByText("E4")).toBeInTheDocument();
    expect(screen.getByText("Terraced house")).toBeInTheDocument();
    expect(screen.getByText("3 beds")).toBeInTheDocument();
    expect(screen.getByText("Sarah hired you")).toBeInTheDocument();
    expect(
      screen.getByText(/Sarah has 2 completed projects/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Available next week\?/)).toBeInTheDocument();
  });

  it("falls back to 'A homeowner' when first name is missing", () => {
    const hire = aHire({
      project: {
        ...aHire().project,
        ownerFirstName: null,
      },
    });

    render(<HireRequestCard hire={hire} />);

    expect(screen.getByText("A homeowner hired you")).toBeInTheDocument();
  });

  it("uses 'is new to VetMyBuilder' when completedProjectsCount is 0", () => {
    const hire = aHire({
      project: { ...aHire().project, completedProjectsCount: 0 },
    });

    render(<HireRequestCard hire={hire} />);

    expect(
      screen.getByText(/Sarah is new to VetMyBuilder/i),
    ).toBeInTheDocument();
  });

  it("singular wording when completedProjectsCount is 1", () => {
    const hire = aHire({
      project: { ...aHire().project, completedProjectsCount: 1 },
    });

    render(<HireRequestCard hire={hire} />);

    expect(
      screen.getByText(/Sarah has 1 completed project on VetMyBuilder/i),
    ).toBeInTheDocument();
  });

  it("shows Accept and Decline buttons only on a pending hire", () => {
    render(<HireRequestCard hire={aHire({ status: "pending" })} />);

    expect(screen.getByTestId("hire-request-accept-17")).toBeInTheDocument();
    expect(screen.getByTestId("hire-request-decline-17")).toBeInTheDocument();
  });

  it("hides action buttons on a non-pending hire", () => {
    render(<HireRequestCard hire={aHire({ status: "accepted" })} />);

    expect(
      screen.queryByTestId("hire-request-accept-17"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("hire-request-decline-17"),
    ).not.toBeInTheDocument();
  });

  it("shows the tradesman's reply on an already-responded hire", () => {
    render(
      <HireRequestCard
        hire={aHire({
          status: "accepted",
          tradesmanMessage: "Looking forward to it",
        })}
      />,
    );

    expect(screen.getByText(/Your reply:/i)).toBeInTheDocument();
    expect(screen.getByText(/Looking forward to it/)).toBeInTheDocument();
  });

  it("clicking Accept reveals the message form, and Confirm Accept calls the accept endpoint", async () => {
    api.patch.mockResolvedValue({ data: { ok: true } });
    const onResponded = vi.fn();

    render(<HireRequestCard hire={aHire()} onResponded={onResponded} />);

    fireEvent.click(screen.getByTestId("hire-request-accept-17"));

    const messageField = await screen.findByTestId("hire-request-message-17");
    fireEvent.change(messageField, { target: { value: "Sounds great" } });

    fireEvent.click(screen.getByTestId("hire-request-confirm-17"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/hires/17/accept", {
        tradesmanMessage: "Sounds great",
      });
      expect(onResponded).toHaveBeenCalled();
    });
  });

  it("clicking Decline reveals the message form, and Confirm Decline calls the decline endpoint", async () => {
    api.patch.mockResolvedValue({ data: { ok: true } });
    const onResponded = vi.fn();

    render(<HireRequestCard hire={aHire()} onResponded={onResponded} />);

    fireEvent.click(screen.getByTestId("hire-request-decline-17"));

    fireEvent.click(screen.getByTestId("hire-request-confirm-17"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/api/hires/17/decline", {
        tradesmanMessage: undefined,
      });
      expect(onResponded).toHaveBeenCalled();
    });
  });

  it("clicking Cancel inside the response form returns to the action buttons", async () => {
    render(<HireRequestCard hire={aHire()} />);

    fireEvent.click(screen.getByTestId("hire-request-accept-17"));
    await screen.findByTestId("hire-request-message-17");

    fireEvent.click(screen.getByTestId("hire-request-cancel-17"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("hire-request-message-17"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("hire-request-accept-17"),
      ).toBeInTheDocument();
    });
  });

  it("displays an inline error and does NOT call onResponded when the API rejects", async () => {
    api.patch.mockRejectedValue({
      response: { data: { error: "HIRE_NOT_PENDING" } },
    });
    const onResponded = vi.fn();

    render(<HireRequestCard hire={aHire()} onResponded={onResponded} />);

    fireEvent.click(screen.getByTestId("hire-request-accept-17"));
    fireEvent.click(screen.getByTestId("hire-request-confirm-17"));

    await waitFor(() => {
      expect(screen.getByTestId("hire-request-error-17")).toHaveTextContent(
        "HIRE_NOT_PENDING",
      );
      expect(onResponded).not.toHaveBeenCalled();
    });
  });
});
