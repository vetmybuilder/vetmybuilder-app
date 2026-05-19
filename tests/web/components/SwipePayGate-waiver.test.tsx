// tests/web/components/SwipePayGate-waiver.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const postSpy = vi.fn().mockResolvedValue({ data: { ok: true } });
const getSpy = vi.fn().mockResolvedValue({ data: {} });

vi.mock("@/utils/api", () => ({
  useApi: () => ({
    get: getSpy,
    post: postSpy,
  }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    asPath: "/tradesman/jobs",
  }),
}));

import SwipePayGate from "../../../web/components/tradesmen/SwipePayGate";

const subject = {
  projectId: 7,
  title: "Plumbing in E4",
  location: "E4",
  type: "Plumber",
  priceBandLabel: null,
};

describe("<SwipePayGate /> CCR 2013 waiver checkbox", () => {
  beforeEach(() => {
    postSpy.mockClear();
    getSpy.mockClear();
  });

  it("starts with both pay buttons disabled until the waiver is ticked", () => {
    render(<SwipePayGate open subject={subject} onClose={() => {}} />);

    // Component renders both desktop and mobile branches; each branch has
    // its own CTA + one-off button with the same testid. Both should be
    // disabled while waiverAccepted is false.
    const passButtons = screen.getAllByTestId("swipe-paygate-cta");
    const oneOffButtons = screen.getAllByTestId("swipe-paygate-oneoff");
    expect(passButtons.length).toBeGreaterThan(0);
    expect(oneOffButtons.length).toBeGreaterThan(0);
    for (const btn of [...passButtons, ...oneOffButtons]) {
      expect(btn).toBeDisabled();
    }
  });

  it("enables the pay buttons once the waiver checkbox is ticked", () => {
    render(<SwipePayGate open subject={subject} onClose={() => {}} />);

    const checkbox = screen.getAllByTestId("paygate-waiver-input")[0];
    fireEvent.click(checkbox);

    for (const btn of screen.getAllByTestId("swipe-paygate-cta")) {
      expect(btn).toBeEnabled();
    }
    for (const btn of screen.getAllByTestId("swipe-paygate-oneoff")) {
      expect(btn).toBeEnabled();
    }
  });

  it("includes waiverAccepted: true in the subscription checkout call", async () => {
    render(<SwipePayGate open subject={subject} onClose={() => {}} />);

    fireEvent.click(screen.getAllByTestId("paygate-waiver-input")[0]);
    fireEvent.click(screen.getAllByTestId("swipe-paygate-cta")[0]);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/api/subscriptions/checkout",
        expect.objectContaining({ waiverAccepted: true }),
      );
    });
  });

  it("includes waiverAccepted: true in the one-off unlock call", async () => {
    render(<SwipePayGate open subject={subject} onClose={() => {}} />);

    fireEvent.click(screen.getAllByTestId("paygate-waiver-input")[0]);
    fireEvent.click(screen.getAllByTestId("swipe-paygate-oneoff")[0]);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/api/projects/7/unlock-contact/checkout",
        expect.objectContaining({ waiverAccepted: true }),
      );
    });
  });
});
