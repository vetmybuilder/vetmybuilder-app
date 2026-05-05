// tests/web/components/JobDetailsSheet.test.tsx
//
// Bottom-sheet job preview opened from the tradesman jobs list.
// Fetches /api/projects/:id for the description / unlock price /
// AI summary, then renders either the subscriber panel (with
// "open in deck" CTA) or the non-subscriber panel (Subscribe +
// one-off Pitch CTAs).

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const subject = {
  projectId: 7,
  title: "Loft conversion",
  type: "Loft Conversion",
  location: "E4",
};

const get = vi.fn(async () => ({
  data: {
    project: {
      id: 7,
      description: "Dormer loft conversion with en-suite.",
      aiSummary: "Homeowner wants a 3-bed loft conversion with bathroom.",
    },
    unlockPrice: 499,
  },
}));
const apiInstance = { get, post: vi.fn() };
vi.mock("@/utils/api", () => ({ useApi: () => apiInstance }));

import JobDetailsSheet from "@/components/tradesmen/JobDetailsSheet";

describe("<JobDetailsSheet />", () => {
  beforeEach(() => {
    get.mockClear();
  });

  it("renders nothing when open is false", () => {
    render(
      <JobDetailsSheet
        subject={subject}
        open={false}
        isSubscribed={false}
        onClose={vi.fn()}
        onSubscribe={vi.fn()}
        onPitch={vi.fn()}
        onSwipe={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("job-details-sheet")).toBeNull();
  });

  it("non-subscriber: shows both CTAs and clicking Pitch fires onPitch", async () => {
    const onPitch = vi.fn();
    render(
      <JobDetailsSheet
        subject={subject}
        open={true}
        isSubscribed={false}
        onClose={vi.fn()}
        onSubscribe={vi.fn()}
        onPitch={onPitch}
        onSwipe={vi.fn()}
      />,
    );
    // Sheet appears with the AI summary loaded from /api/projects/7.
    await waitFor(() =>
      expect(
        screen.getByText(/Homeowner wants a 3-bed loft/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /subscribe — week/i }),
    ).toBeInTheDocument();

    const pitchBtn = screen.getByRole("button", { name: /pitch the homeowner/i });
    fireEvent.click(pitchBtn);
    await waitFor(() => {
      expect(onPitch).toHaveBeenCalledWith(7);
    });
  });

  it("subscriber: shows the subscriber panel and Open-in-deck calls onSwipe + onClose", async () => {
    const onSwipe = vi.fn();
    const onClose = vi.fn();
    render(
      <JobDetailsSheet
        subject={subject}
        open={true}
        isSubscribed={true}
        onClose={onClose}
        onSubscribe={vi.fn()}
        onPitch={vi.fn()}
        onSwipe={onSwipe}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/already subscribed/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /open in swipe deck/i }));
    expect(onSwipe).toHaveBeenCalledWith(7);
    expect(onClose).toHaveBeenCalled();
  });

  it("non-subscriber: clicking the Subscribe CTA fires onSubscribe", async () => {
    const onSubscribe = vi.fn();
    render(
      <JobDetailsSheet
        subject={subject}
        open={true}
        isSubscribed={false}
        onClose={vi.fn()}
        onSubscribe={onSubscribe}
        onPitch={vi.fn()}
        onSwipe={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /subscribe — week/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /subscribe — week/i }));
    expect(onSubscribe).toHaveBeenCalled();
  });
});
