// tests/server/tradesman.matches.selfUids.spec.ts
//
// Regression guard for the master-operator unread-count bug in
// server/routes/tradesman/matches.get.js. A master operator (e.g.
// Elegant in the seeded dev DB) can send chat messages on behalf of
// their ghost personas — the chat_messages row gets persisted with
// the ghost's uid as sender, not the master's. Before the fix, the
// unread-count SQL filtered "my own outgoing messages" with
// `sender_uid = ?` against just the logged-in uid, so ghost-attributed
// messages stacked up as unread on the master's own inbox.
//
// The fix expands "self" to include every ghost where
// `master_uid = builderUid` and uses `IN (selfPh)` for the filter on
// both sides of the query.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(__dirname, "../../server/routes/tradesman/matches.get.js"),
  "utf8",
);

describe("tradesman/matches.get unread-count selfUids expansion", () => {
  it("resolves a selfUids set that includes ghost personas owned by the master", () => {
    // Look for the lookup that pulls all tradesmen rows where
    // master_uid = caller. This is the broadening step.
    expect(source).toMatch(
      /SELECT\s+user_id\s+FROM\s+tradesmen\s+WHERE\s+master_uid\s*=\s*\?/i,
    );
  });

  it("unread query filters sender_uid by IN (selfUids), not equality", () => {
    // The inner mine.myLast subquery and the outer NOT IN both have
    // to use the IN-list form for the fix to work. Either equality
    // form (`sender_uid = ?` or `sender_uid <> ?`) on the unread query
    // is a regression.
    expect(source).toMatch(
      /WHERE\s+sender_uid\s+IN\s*\(\$\{selfPh\}\)/i,
    );
    expect(source).toMatch(
      /AND\s+cm\.sender_uid\s+NOT\s+IN\s*\(\$\{selfPh\}\)/i,
    );
  });

  it("does not regress to the pre-fix `sender_uid = ?` equality form on the inner subquery", () => {
    // We allow `sender_uid = ?` inside other unrelated queries in this
    // file, but specifically the unread-count inner subquery should
    // be the IN form. Catch the exact pre-fix pattern.
    expect(source).not.toMatch(
      /SELECT\s+match_id,\s+MAX\(created_at\)\s+AS\s+myLast\s+FROM\s+chat_messages\s+WHERE\s+sender_uid\s*=\s*\?/i,
    );
  });
});
