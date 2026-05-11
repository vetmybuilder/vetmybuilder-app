// tests/web/components/SiteHeader.popDock.regression.test.ts
//
// Regression guard: clicking the bell icon in the homeowner header
// must NOT pop the bottom-right MessagingDock. The dock should only
// open when the user clicks a specific thread row inside the dropdown
// (or via /projects/:id?openChat=N).
//
// We've had this regress more than once because the prop
// `popDockOnOpen` on MessagesIconButton is opt-in - a single typo can
// re-enable the "dock opens with the dropdown" behaviour. A full
// SiteHeader render test would need to mock auth / router / api /
// SSE / role hooks just to reach the button; a static-source check
// gives us the same coverage at ~100× the speed.
//
// Pair this with the behavioural unit test on MessagesIconButton
// itself (tests/web/components/MessagesIconButton.test.tsx). The
// component test verifies the prop works correctly when set; this
// test verifies SiteHeader doesn't set it on the homeowner path.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SITE_HEADER_PATH = resolve(__dirname, "../../../web/components/SiteHeader.tsx");

describe("SiteHeader — homeowner bell icon", () => {
  const source = readFileSync(SITE_HEADER_PATH, "utf8");

  // Sanity check: the file we're parsing actually mounts the homeowner
  // MessagesIconButton. If this fails the static regex below is
  // pointless — likely a refactor moved the icon elsewhere.
  it("still mounts <MessagesIconButton /> for the homeowner branch", () => {
    expect(source).toMatch(/displayUser\s*&&\s*!isTrades\s*&&[\s\S]*?<MessagesIconButton/);
  });

  // The actual regression guard. We grep the homeowner branch for the
  // forbidden prop. The trade-side branch is allowed to opt into it in
  // the future without tripping this test - we only scope the search.
  it("does not pass popDockOnOpen on the homeowner MessagesIconButton", () => {
    // Carve out just the homeowner block: from `!isTrades` opening to
    // the next `MessagesIconButton` close (the trade branch).
    const start = source.indexOf("!isTrades");
    expect(start).toBeGreaterThan(-1);
    const tail = source.slice(start);
    const homeownerBlockEnd = tail.indexOf(") &&", tail.indexOf("</MessagesIconButton>") || tail.indexOf("/>") + 1);
    // Fall back to a generous window if we can't find the trade branch
    // (e.g. the file structure changed). 2k chars is more than enough
    // to span any single component invocation.
    const homeownerBlock = tail.slice(
      0,
      homeownerBlockEnd > 0 ? homeownerBlockEnd : 2000,
    );
    expect(homeownerBlock).not.toMatch(/popDockOnOpen/);
  });
});
