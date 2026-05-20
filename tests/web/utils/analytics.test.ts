import { describe, it, expect, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    capture: vi.fn(),
  },
}));

import {
  trackJobSwiped,
  trackMatchFormed,
  trackChatMessageSent,
  trackPaymentFailed,
  trackProjectClosed,
} from "@/utils/analytics";
import posthog from "posthog-js";

describe("analytics helpers", () => {
  it("do not call posthog.capture when posthog is not loaded", () => {
    trackJobSwiped("right", 1, "subscribed");
    trackMatchFormed(1, "u1", "subscribed");
    trackChatMessageSent(2, false);
    trackPaymentFailed("oneoff", "card_declined", 1);
    trackProjectClosed(1, { winnerPicked: true, wouldUseAgain: true });
    expect((posthog as any).capture).not.toHaveBeenCalled();
  });

  it("do call posthog.capture once loaded", () => {
    (posthog as any).__loaded = true;
    (posthog as any).capture.mockClear();
    trackJobSwiped("right", 42, "paid_unlock");
    expect((posthog as any).capture).toHaveBeenCalledWith("job_swiped", {
      direction: "right",
      project_id: 42,
      source: "paid_unlock",
    });
  });
});
