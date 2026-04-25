// tests/web/components/BottomSheetPicker.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BottomSheetPicker from "@/components/project/BottomSheetPicker";

const OPTIONS = [
  { value: "", label: "All types" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
];

describe("BottomSheetPicker", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <BottomSheetPicker
        open={false}
        onClose={() => {}}
        title="Filter by type"
        options={OPTIONS}
        selected=""
        onSelect={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title, subtitle, and options when open", () => {
    render(
      <BottomSheetPicker
        open
        onClose={() => {}}
        title="Filter by type"
        subtitle="Show only projects of a certain trade."
        options={OPTIONS}
        selected="bathroom"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Filter by type")).toBeInTheDocument();
    expect(
      screen.getByText("Show only projects of a certain trade."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("picker-option-all")).toBeInTheDocument();
    expect(screen.getByTestId("picker-option-bathroom")).toBeInTheDocument();
    expect(screen.getByTestId("picker-option-kitchen")).toBeInTheDocument();
  });

  it("marks the selected option with aria-pressed=true", () => {
    render(
      <BottomSheetPicker
        open
        onClose={() => {}}
        title="Filter by type"
        options={OPTIONS}
        selected="kitchen"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("picker-option-kitchen")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("picker-option-bathroom")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onSelect with the new value and onClose when a row is tapped", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <BottomSheetPicker
        open
        onClose={onClose}
        title="Filter by type"
        options={OPTIONS}
        selected=""
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("picker-option-bathroom"));
    expect(onSelect).toHaveBeenCalledWith("bathroom");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Done button just closes the sheet", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <BottomSheetPicker
        open
        onClose={onClose}
        title="Filter by type"
        options={OPTIONS}
        selected="bathroom"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Clear filter calls onSelect(\"\") and closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <BottomSheetPicker
        open
        onClose={onClose}
        title="Filter by type"
        options={OPTIONS}
        selected="bathroom"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Clear filter/i }));
    expect(onSelect).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides Clear filter when nothing is selected", () => {
    render(
      <BottomSheetPicker
        open
        onClose={() => {}}
        title="Filter by type"
        options={OPTIONS}
        selected=""
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Clear filter/i })).toBeNull();
  });
});
