// tests/server/payments.paidUnlockSilent.spec.ts
//
// Regression guard for the paid_unlock bell-silence cleanup. Per the
// agreed messaging model, paid_unlock arrivals are silent on the
// homeowner's notification bell — the only signal is the emerald
// PRIORITY pill on /projects (and the boost badge inside the
// shortlist). Earlier code inserted a chat_message_new notification
// from activate-unlock.post.js and a paid_unlock_card notification
// from mock.pay.post.js. Both were spam from the homeowner's
// perspective and have been removed.
//
// If either notification type re-appears in those files, this guard
// fails — preventing the bug from sneaking back in.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const activateUnlockSrc = readFileSync(
  join(__dirname, "../../server/routes/payments/activate-unlock.post.js"),
  "utf8",
);
const mockPaySrc = readFileSync(
  join(__dirname, "../../server/routes/payments/mock.pay.post.js"),
  "utf8",
);

describe("paid_unlock bell-silence regression guard", () => {
  it("activate-unlock.post.js does not insert chat_message_new notifications", () => {
    // The previous code did `INSERT INTO notifications ... 'chat_message_new'`
    // on every paid_unlock activation, spamming the homeowner's bell.
    expect(activateUnlockSrc).not.toMatch(/'chat_message_new'/);
    // Belt-and-braces: the route also no longer broadcasts a
    // chat_message_new notification.
    expect(activateUnlockSrc).not.toMatch(
      /broadcastNotification[\s\S]{0,200}chat_message_new/,
    );
  });

  it("mock.pay.post.js does not insert paid_unlock_card notifications", () => {
    // The previous code inserted a `paid_unlock_card` notification
    // when the mock provider activated a paid_unlock. Same anti-spam
    // rationale.
    expect(mockPaySrc).not.toMatch(/'paid_unlock_card'/);
    expect(mockPaySrc).not.toMatch(
      /broadcastNotification[\s\S]{0,200}paid_unlock_card/,
    );
  });

  it("mock.pay.post.js still broadcasts the real-time deck_card_added event", () => {
    // deck_card_added is an SSE event for live deck refresh on an
    // open /projects/:id page — NOT a bell notification. It must stay.
    expect(mockPaySrc).toMatch(/broadcastEvent[\s\S]{0,200}deck_card_added/);
  });
});
