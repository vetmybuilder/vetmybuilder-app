// tests/web/components/ProjectActionsSheet.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const routerPush = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ push: routerPush, back: vi.fn(), query: {} }),
}));

import ProjectActionsSheet from "@/components/project/ProjectActionsSheet";

describe("<ProjectActionsSheet />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ProjectActionsSheet
        open={false}
        onClose={vi.fn()}
        projectId="42"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only Mark project as completed (Archive removed)", () => {
    render(
      <ProjectActionsSheet open onClose={vi.fn()} projectId="42" />,
    );

    expect(
      screen.getByTestId("project-actions-mark-complete"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("project-actions-archive"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Mark project as completed/i),
    ).toBeInTheDocument();
  });

  it("tapping Mark as completed routes to /projects/[id]/close and closes the sheet", () => {
    const onClose = vi.fn();
    render(
      <ProjectActionsSheet open onClose={onClose} projectId="42" />,
    );

    fireEvent.click(screen.getByTestId("project-actions-mark-complete"));

    expect(onClose).toHaveBeenCalledOnce();
    expect(routerPush).toHaveBeenCalledWith("/projects/42/close");
  });

  it("Cancel button closes the sheet without routing", () => {
    const onClose = vi.fn();
    render(
      <ProjectActionsSheet open onClose={onClose} projectId="42" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
