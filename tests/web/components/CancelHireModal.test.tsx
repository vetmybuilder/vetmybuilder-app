// tests/web/components/CancelHireModal.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

import CancelHireModal from "../../../web/components/project/CancelHireModal";

describe("<CancelHireModal />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <CancelHireModal
        open={false}
        targetName="Elegant Building Services"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("cancel-hire-modal"),
    ).not.toBeInTheDocument();
  });

  it("shows the target name in the body when open", () => {
    render(
      <CancelHireModal
        open
        targetName="Elegant Building Services"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Elegant Building Services/i),
    ).toBeInTheDocument();
  });

  it("shows an error and does NOT call onConfirm when no reason is selected", async () => {
    const onConfirm = vi.fn();

    render(
      <CancelHireModal
        open
        targetName="Elegant"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("cancel-hire-submit"));

    expect(
      await screen.findByTestId("cancel-hire-error"),
    ).toHaveTextContent(/Please select a reason/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the selected reason", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <CancelHireModal
        open
        targetName="Elegant"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("cancel-hire-reason"), {
      target: { value: "changed_mind" },
    });
    fireEvent.click(screen.getByTestId("cancel-hire-submit"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("changed_mind");
    });
  });

  it("displays an inline error when onConfirm rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue({
      response: { data: { error: "HIRE_NOT_CANCELLABLE" } },
    });

    render(
      <CancelHireModal
        open
        targetName="Elegant"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("cancel-hire-reason"), {
      target: { value: "chose_another" },
    });
    fireEvent.click(screen.getByTestId("cancel-hire-submit"));

    expect(
      await screen.findByTestId("cancel-hire-error"),
    ).toHaveTextContent("HIRE_NOT_CANCELLABLE");
  });

  it("clicking Back calls onClose", () => {
    const onClose = vi.fn();

    render(
      <CancelHireModal
        open
        targetName="Elegant"
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("cancel-hire-back"));

    expect(onClose).toHaveBeenCalled();
  });
});
