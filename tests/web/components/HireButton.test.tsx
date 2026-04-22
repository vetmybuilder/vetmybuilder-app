// tests/web/components/HireButton.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ---- Mocks ----
const api = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock("@/utils/api", () => ({
  useApi: () => api,
}));

// router: configurable per-test via routerQuery
let routerQuery: Record<string, any> = {};
vi.mock("next/router", () => ({
  useRouter: () => ({ query: routerQuery }),
}));

import HireButton from "../../../web/components/project/HireButton";

describe("<HireButton />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerQuery = {};
  });

  /* ----------------------------------------------------------------------
   * Visibility / project context guards
   * -------------------------------------------------------------------- */

  it("renders nothing when there is no projectId in the URL", () => {
    routerQuery = {};
    render(
      <HireButton
        recommendationId={4}
        displayName="Elegant Building Services"
      />,
    );

    expect(screen.queryByTestId("hire-button")).not.toBeInTheDocument();
  });

  it("ignores a non-numeric projectId in the query string", () => {
    routerQuery = { projectId: "not-a-number" };

    render(<HireButton recommendationId={4} displayName="Elegant" />);

    expect(screen.queryByTestId("hire-button")).not.toBeInTheDocument();
  });

  it("renders nothing when neither id type is provided", () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({ data: { items: [] } });

    render(<HireButton displayName="Elegant" />);

    expect(screen.queryByTestId("hire-button")).not.toBeInTheDocument();
  });

  it("hides the button when the project is not accessible (404 / 403)", async () => {
    routerQuery = { projectId: "999999" };
    api.get.mockRejectedValue({ response: { status: 404 } });

    render(<HireButton recommendationId={4} displayName="Elegant" />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("hire-button")).not.toBeInTheDocument();
  });

  /* ----------------------------------------------------------------------
   * Recommendation mode (used on /builders/[id])
   * -------------------------------------------------------------------- */

  it("[recommendation] renders Hire when not yet hired", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({ data: { items: [] } });

    render(
      <HireButton
        recommendationId={4}
        displayName="Elegant Building Services"
      />,
    );

    const btn = await screen.findByTestId("hire-button");
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent(/Hire/i);
  });

  it("[recommendation] renders 'Hire pending' (disabled) when this recommendation has a pending hire", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({
      data: {
        items: [{ id: 9, recommendationId: 4, status: "pending" }],
      },
    });

    render(
      <HireButton
        recommendationId={4}
        displayName="Elegant Building Services"
      />,
    );

    const btn = await screen.findByTestId("hire-button");
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent(/Hire pending/i);
  });

  it("[recommendation] terminal-status hires (declined/cancelled/expired) do NOT block the button", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({
      data: {
        items: [
          { id: 7, recommendationId: 4, status: "declined" },
          { id: 8, recommendationId: 4, status: "cancelled" },
          { id: 9, recommendationId: 4, status: "expired" },
        ],
      },
    });

    render(
      <HireButton
        recommendationId={4}
        displayName="Elegant Building Services"
      />,
    );

    const btn = await screen.findByTestId("hire-button");
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent(/Hire/i);
  });

  it("[recommendation] clicking Hire opens the modal and POSTs with recommendationId", async () => {
    routerQuery = { projectId: "123" };
    api.get
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 9, recommendationId: 4, status: "pending" }],
        },
      });
    api.post.mockResolvedValue({ data: { ok: true } });

    render(
      <HireButton
        recommendationId={4}
        displayName="Elegant Building Services"
      />,
    );

    fireEvent.click(await screen.findByTestId("hire-button"));

    expect(
      await screen.findByTestId("hire-confirm-modal"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("hire-confirm-message"), {
      target: { value: "Please respond ASAP" },
    });
    fireEvent.click(screen.getByTestId("hire-confirm-submit"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/projects/123/hires", {
        recommendationId: 4,
        homeownerMessage: "Please respond ASAP",
      });
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("hire-button")).toBeDisabled();
    });
  });

  it("[recommendation] propagates an API error to the modal when the hire fails", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({ data: { items: [] } });
    api.post.mockRejectedValue({
      response: { data: { error: "ALREADY_HIRED" } },
    });

    render(
      <HireButton
        recommendationId={4}
        displayName="Elegant Building Services"
      />,
    );

    fireEvent.click(await screen.findByTestId("hire-button"));
    fireEvent.click(screen.getByTestId("hire-confirm-submit"));

    expect(
      await screen.findByTestId("hire-confirm-error"),
    ).toHaveTextContent("ALREADY_HIRED");
  });

  /* ----------------------------------------------------------------------
   * Tradesman mode (used on /tradesman/[id])
   * -------------------------------------------------------------------- */

  it("[tradesman] renders Hire when not yet hired", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({ data: { items: [] } });

    render(
      <HireButton
        tradesmanUserId="tm-abc-xyz"
        displayName="Pimlico Plumbers"
      />,
    );

    const btn = await screen.findByTestId("hire-button");
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent(/Hire/i);
  });

  it("[tradesman] renders 'Hire pending' (disabled) when this tradesman has a pending hire", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({
      data: {
        items: [
          { id: 9, tradesmanUserId: "tm-abc-xyz", status: "pending" },
        ],
      },
    });

    render(
      <HireButton
        tradesmanUserId="tm-abc-xyz"
        displayName="Pimlico Plumbers"
      />,
    );

    const btn = await screen.findByTestId("hire-button");
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveTextContent(/Hire pending/i);
  });

  it("[tradesman] does NOT match a hire for a different tradesmanUserId", async () => {
    routerQuery = { projectId: "123" };
    api.get.mockResolvedValue({
      data: {
        items: [
          { id: 9, tradesmanUserId: "someone-else", status: "pending" },
        ],
      },
    });

    render(
      <HireButton
        tradesmanUserId="tm-abc-xyz"
        displayName="Pimlico Plumbers"
      />,
    );

    const btn = await screen.findByTestId("hire-button");
    expect(btn).toBeEnabled();
  });

  it("[tradesman] clicking Hire POSTs with tradesmanUserId (not recommendationId)", async () => {
    routerQuery = { projectId: "123" };
    api.get
      .mockResolvedValueOnce({ data: { items: [] } })
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: 9, tradesmanUserId: "tm-abc-xyz", status: "pending" },
          ],
        },
      });
    api.post.mockResolvedValue({ data: { ok: true } });

    render(
      <HireButton
        tradesmanUserId="tm-abc-xyz"
        displayName="Pimlico Plumbers"
      />,
    );

    fireEvent.click(await screen.findByTestId("hire-button"));
    fireEvent.click(screen.getByTestId("hire-confirm-submit"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/projects/123/hires", {
        tradesmanUserId: "tm-abc-xyz",
        homeownerMessage: undefined,
      });
    });
  });
});
