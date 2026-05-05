import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ShareProjectModal from "@/components/project/ShareProjectModal";

describe("ShareProjectModal", () => {
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: {
        origin: "https://app.test",
        href: "",
        get assign() {
          return assignSpy;
        },
      } as any,
    });
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ShareProjectModal open={false} onClose={() => {}} projectId="p1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders three channels and a message preview", () => {
    render(
      <ShareProjectModal
        open
        onClose={() => {}}
        projectId="p1"
        projectName="Bathroom fitting"
      />,
    );
    expect(screen.getByRole("button", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^SMS/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Email/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Bathroom fitting/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Message preview/i)).toBeInTheDocument();
  });

  it("opens WhatsApp deep link with prefilled message", () => {
    render(
      <ShareProjectModal
        open
        onClose={() => {}}
        projectId="p1"
        projectName="Bathroom fitting"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/i }));
    expect(window.location.href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(window.location.href)).toContain(
      "https://app.test/projects/p1/recommend",
    );
    expect(decodeURIComponent(window.location.href)).toContain("Bathroom fitting");
  });

  it("calls onClose when Cancel is tapped", () => {
    const onClose = vi.fn();
    render(<ShareProjectModal open onClose={onClose} projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
