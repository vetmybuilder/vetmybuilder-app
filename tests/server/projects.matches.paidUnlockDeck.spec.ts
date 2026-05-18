// tests/server/projects.matches.paidUnlockDeck.spec.ts
//
// Regression guard for the paid_unlock candidate query in
// server/routes/projects/matches.get.js. paid_unlock rows are inserted
// by activate-unlock.post.js with status='matched' (not 'pending') —
// the homeowner hasn't reciprocated until they swipe the boost card.
// The previous deck query required `status='pending'`, which meant
// the boosted "Wants this job" card never surfaced in the homeowner's
// shortlist. The fix accepts both `pending` and `matched`, using
// `homeowner_swiped_at IS NULL` as the real discriminator for "still
// awaiting the homeowner's reciprocal swipe".

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(__dirname, "../../server/routes/projects/matches.get.js"),
  "utf8",
);

describe("projects/matches.get paid_unlock deck query", () => {
  it("paid_unlock candidates accept both 'pending' and 'matched' status", () => {
    // The candidate-loading SELECT must use an IN-list, not equality
    // with 'pending'.
    expect(source).toMatch(
      /si\.status\s+IN\s*\(\s*'pending'\s*,\s*'matched'\s*\)/i,
    );
    // And the file must reference the paid_unlock source nearby, so
    // we're not matching some unrelated status filter elsewhere.
    expect(source).toMatch(/source\s*=\s*'paid_unlock'/i);
  });

  it("homeowner_swiped_at IS NULL is the real discriminator (still awaiting reciprocation)", () => {
    expect(source).toMatch(/si\.homeowner_swiped_at\s+IS\s+NULL/i);
  });

  it("does not regress to the pre-fix `status = 'pending'` paid_unlock filter", () => {
    // The pre-fix shape was `AND si.status = 'pending'` immediately
    // after `source = 'paid_unlock'`. Catch reverts that restore that
    // exact pattern.
    expect(source).not.toMatch(
      /source\s*=\s*'paid_unlock'[\s\S]{0,80}AND\s+si\.status\s*=\s*'pending'\s+AND\s+si\.homeowner_swiped_at/i,
    );
  });
});
