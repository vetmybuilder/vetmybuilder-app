// tests/web/components/HireConfirmModal.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

import HireConfirmModal from "../../../web/components/project/HireConfirmModal";

describe("<HireConfirmModal />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <HireConfirmModal
        open={false}
        targetName="Elegant Building Services"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("hire-confirm-modal"),
    ).not.toBeInTheDocument();
  });

  it("shows the target name in the title when open", () => {
    render(
      <HireConfirmModal
        open
        targetName="Elegant Building Services"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Hire Elegant Building Services?"),
    ).toBeInTheDocument();
  });

  it("calls onConfirm with the trimmed message and closes via the parent", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <HireConfirmModal
        open
        targetName="Elegant"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("hire-confirm-message"), {
      target: { value: "  Hello there  " },
    });
    fireEvent.click(screen.getByTestId("hire-confirm-submit"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("Hello there");
    });
  });

  it("calls onConfirm with an empty string when no message is typed", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <HireConfirmModal
        open
        targetName="Elegant"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("hire-confirm-submit"));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("");
    });
  });

  it("displays an inline error when onConfirm rejects", async () => {
    const onConfirm = vi.fn().mockRejectedValue({
      response: { data: { error: "ALREADY_HIRED" } },
    });

    render(
      <HireConfirmModal
        open
        targetName="Elegant"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("hire-confirm-submit"));

    expect(
      await screen.findByTestId("hire-confirm-error"),
    ).toHaveTextContent("ALREADY_HIRED");
  });

  it("clicking Cancel calls onClose", () => {
    const onClose = vi.fn();

    render(
      <HireConfirmModal
        open
        targetName="Elegant"
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("hire-confirm-cancel"));

    expect(onClose).toHaveBeenCalled();
  });
});
