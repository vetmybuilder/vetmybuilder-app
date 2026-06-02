import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ShareProjectModal from "@/components/project/ShareProjectModal";

// Nextdoor/Facebook tiles are gated by their own flags; default both off so the
// existing three-channel tests are unaffected.
const flagState: Record<string, boolean> = {};
vi.mock("@/utils/useFeatureFlags", () => ({
  useFeatureFlag: (key: string) => !!flagState[key],
}));

const realUserAgent = navigator.userAgent;
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

describe("ShareProjectModal", () => {
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    flagState.share_nextdoor = false;
    flagState.share_facebook = false;
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

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: realUserAgent,
      configurable: true,
    });
    delete (navigator as any).share;
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

  // ---- Nextdoor + Facebook gating ----

  it("hides Nextdoor/Facebook tiles when their flags are off", () => {
    render(<ShareProjectModal open onClose={() => {}} projectId="p1" />);
    expect(screen.queryByTestId("share-nextdoor")).toBeNull();
    expect(screen.queryByTestId("share-facebook")).toBeNull();
  });

  it("shows Nextdoor/Facebook as web links on desktop when their flags are on", () => {
    flagState.share_nextdoor = true;
    flagState.share_facebook = true;
    render(<ShareProjectModal open onClose={() => {}} projectId="p1" />);
    expect(
      screen.getByTestId("share-nextdoor").getAttribute("href"),
    ).toContain("nextdoor.com/sharekit");
    expect(
      screen.getByTestId("share-facebook").getAttribute("href"),
    ).toContain("facebook.com/sharer");
  });

  it("on mobile the Nextdoor/Facebook tiles invoke navigator.share", async () => {
    flagState.share_nextdoor = true;
    flagState.share_facebook = true;
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    );
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = shareSpy;

    render(<ShareProjectModal open onClose={() => {}} projectId="p1" />);

    await waitFor(() =>
      expect(screen.getByTestId("share-facebook")).not.toHaveAttribute("href"),
    );
    fireEvent.click(screen.getByTestId("share-nextdoor"));
    fireEvent.click(screen.getByTestId("share-facebook"));
    expect(shareSpy).toHaveBeenCalledTimes(2);
  });
});
