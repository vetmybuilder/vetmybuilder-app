// tests/server/projects.get.matchedCountFilter.spec.ts
//
// Regression guard for the matchedCount enrichment query in
// server/routes/projects/projects.get.js. A "true" match requires both
// sides to have right-swiped; paid_unlock rows are inserted with
// status='matched' by activate-unlock.post.js even before the homeowner
// reciprocates (homeowner_swiped_at IS NULL). Without the
// `homeowner_swiped_at IS NOT NULL` filter on matched rows, the
// homeowner's /projects list would incorrectly show a "1 MATCH" pill
// for every pending paid_unlock arrival, double-counting it alongside
// the "1 INTEREST" pill.
//
// The route is heavy (many branches, query enrichment, auth middleware)
// so driving it via a mocked handler is brittle. The SQL is a static
// string in the source, so a regex assertion against the source file
// is sufficient and far more stable.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(__dirname, "../../server/routes/projects/projects.get.js"),
  "utf8",
);

describe("projects.get matchedCount SQL filter", () => {
  it("matched rows must require homeowner_swiped_at IS NOT NULL", () => {
    // The exact clause we depend on. Whitespace-flexible but must
    // contain the conjunction.
    expect(source).toMatch(
      /status\s*=\s*'matched'\s+AND\s+homeowner_swiped_at\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("pending rows still count for waitingCount without the timestamp requirement", () => {
    expect(source).toMatch(/OR\s+status\s*=\s*'pending'/i);
  });

  it("does not regress to the pre-fix `status IN ('matched', 'pending')` shape", () => {
    // The pre-fix filter was a simple IN-list. Anyone reverting the
    // fix will likely restore the IN-list shape. This guards against
    // exactly that.
    expect(source).not.toMatch(/status\s+IN\s*\(\s*'matched'\s*,\s*'pending'\s*\)/i);
  });
});
