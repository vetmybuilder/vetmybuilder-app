import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import ActionButton from "../../../web/components/ui/ActionButton";

describe("<ActionButton />", () => {
  it("renders children when not busy", () => {
    render(<ActionButton onClick={async () => {}}>Save</ActionButton>);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows spinner and busy text when clicked", async () => {
    let resolve: Function;
    const slowAction = () => new Promise<void>((r) => { resolve = r; });

    render(
      <ActionButton onClick={slowAction} busyText="Saving...">
        Save
      </ActionButton>
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    // Button should be disabled while busy
    expect(screen.getByRole("button")).toBeDisabled();

    // Resolve the action
    resolve!();

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });

  it("prevents double-click", async () => {
    let callCount = 0;
    const action = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 100));
    };

    render(
      <ActionButton onClick={action} busyText="Working...">
        Go
      </ActionButton>
    );

    const btn = screen.getByText("Go");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText("Go")).toBeInTheDocument();
    });

    expect(callCount).toBe(1);
  });

  it("re-enables after error", async () => {
    const failAction = async () => { throw new Error("fail"); };

    render(
      <ActionButton onClick={failAction} busyText="Working...">
        Try
      </ActionButton>
    );

    fireEvent.click(screen.getByText("Try"));

    await waitFor(() => {
      expect(screen.getByText("Try")).toBeInTheDocument();
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  it("respects disabled prop", () => {
    render(
      <ActionButton onClick={async () => {}} disabled>
        Disabled
      </ActionButton>
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies variant styles", () => {
    const { container } = render(
      <ActionButton onClick={async () => {}} variant="danger">
        Delete
      </ActionButton>
    );
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("bg-rose-600");
  });

  it("passes data-testid", () => {
    render(
      <ActionButton onClick={async () => {}} data-testid="my-btn">
        Click
      </ActionButton>
    );
    expect(screen.getByTestId("my-btn")).toBeInTheDocument();
  });
});
