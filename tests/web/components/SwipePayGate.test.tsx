// tests/web/components/SwipePayGate.test.tsx
//
// Paid-unlock gate the tradesman swipe deck opens when the server
// returns 403 requiresSubscription on a right-swipe. Two paths:
//   - Subscription pass: POST /api/subscriptions/checkout
//   - One-off unlock: POST /api/projects/:id/unlock-contact/checkout
//     -> mock-pay -> /tradesman/unlock/sent confirmation page
// Solo PR because this is the money flow.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const subject = {
  projectId: 7,
  title: "Loft conversion",
  type: "Loft Conversion",
  location: "E4",
  priceBandLabel: "£60k+",
};

const get = vi.fn(async (url: string) => {
  if (url.startsWith("/api/projects/")) {
    return { data: { unlockPrice: 999 } };
  }
  return { data: {} };
});
const post = vi.fn(async () => ({ data: {} }));
const apiInstance = { get, post };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

const push = vi.fn().mockResolvedValue(undefined);
const replace = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    push,
    replace,
    asPath: "/tradesman/jobs",
    pathname: "/tradesman/jobs",
    query: {},
  }),
}));

import SwipePayGate from "@/components/tradesmen/SwipePayGate";

describe("<SwipePayGate />", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockReset();
    push.mockClear();
    replace.mockClear();
  });

  it("renders nothing when closed", () => {
    render(<SwipePayGate open={false} subject={subject} onClose={vi.fn()} />);
    expect(screen.queryByTestId("swipe-paygate")).toBeNull();
  });

  // The gate renders both desktop and mobile trees in jsdom (no media
  // query gating). Component tests target the desktop variant only -
  // mobile coverage is owned by the Playwright e2e suite. Scope all
  // queries inside the desktop `swipe-paygate-desktop` wrapper.
  it("opens, fetches the project's unlock price, and surfaces both CTAs", async () => {
    render(<SwipePayGate open={true} subject={subject} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith("/api/projects/7");
    });
    const desktop = within(screen.getByTestId("swipe-paygate-desktop"));
    await waitFor(() =>
      expect(desktop.getByTestId("swipe-paygate-oneoff")).toHaveTextContent(
        /Pay £9\.99/,
      ),
    );
    expect(desktop.getByTestId("swipe-paygate-cta")).toBeEnabled();
  });

  it("clicking Subscribe POSTs to /api/subscriptions/checkout", async () => {
    post.mockResolvedValueOnce({ data: { url: "/payments/mock/sub/abc" } });
    const onClose = vi.fn();
    render(<SwipePayGate open={true} subject={subject} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByTestId("swipe-paygate-desktop")).toBeInTheDocument(),
    );
    const desktop = within(screen.getByTestId("swipe-paygate-desktop"));
    fireEvent.click(desktop.getByTestId("swipe-paygate-cta"));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/api/subscriptions/checkout", {
        tier: "month_1",
      });
    });
  });

  it("clicking one-off Pay flows mock-pay then routes to unlock/sent", async () => {
    post
      .mockResolvedValueOnce({
        data: { url: "/payments/mock/checkout/sess123", sessionId: "sess123" },
      })
      .mockResolvedValueOnce({ data: { ok: true } });
    const onClose = vi.fn();
    render(<SwipePayGate open={true} subject={subject} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByTestId("swipe-paygate-desktop")).toBeInTheDocument(),
    );
    const desktop = within(screen.getByTestId("swipe-paygate-desktop"));
    fireEvent.click(desktop.getByTestId("swipe-paygate-oneoff"));

    await waitFor(() =>
      expect(post).toHaveBeenNthCalledWith(
        1,
        "/api/projects/7/unlock-contact/checkout",
        {},
      ),
    );
    await waitFor(() =>
      expect(post).toHaveBeenNthCalledWith(
        2,
        "/api/payments/mock/pay",
        { sessionId: "sess123" },
      ),
    );
    // The mock-pay path inserts a 1200ms "activated" flash before
     // navigating - default waitFor 1000ms times out, hence 2500ms.
    await waitFor(
      () => {
        expect(push).toHaveBeenCalledWith(
          "/tradesman/unlock/sent?projectId=7",
        );
      },
      { timeout: 2500 },
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("alreadyUnlocked short-circuits straight to /tradesman/unlock/sent", async () => {
    post.mockResolvedValueOnce({
      data: { ok: true, alreadyUnlocked: true, matchId: 42 },
    });
    const onClose = vi.fn();
    render(<SwipePayGate open={true} subject={subject} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByTestId("swipe-paygate-desktop")).toBeInTheDocument(),
    );
    const desktop = within(screen.getByTestId("swipe-paygate-desktop"));
    fireEvent.click(desktop.getByTestId("swipe-paygate-oneoff"));

    // alreadyUnlocked path waits ~600ms before navigation.
    await waitFor(
      () => {
        expect(push).toHaveBeenCalledWith(
          "/tradesman/unlock/sent?projectId=7",
        );
      },
      { timeout: 2000 },
    );
    expect(onClose).toHaveBeenCalled();
  });
});
