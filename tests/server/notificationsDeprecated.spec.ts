// tests/server/notificationsDeprecated.spec.ts
//
// Regression guards for two notification types we deprecated in
// 2026-05 because they were noise in the homeowner activity feed:
//
//   - classification_ready: "Project insights are ready" - fired on
//     POST /api/projects and PUT /api/projects/:id. The classifier
//     still runs (its output is stored on the project row), we just
//     no longer push a notification to the owner about an internal
//     AI step.
//
//   - project_live_local: "A neighbour near you is looking for help
//     with X" - fired up to 5 times on first signup. Didn't fit the
//     engagement-first signup flow where the homeowner just wants
//     to post their own job, not recommend tradespeople for others.
//
// These tests grep the real source files. If anyone re-introduces
// the strings, these tests fail. Behavioural tests would also work
// but require mocking the entire route chain - this is the
// lightest possible guard for what is essentially a "don't do this
// anymore" assertion.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Deprecated notifications - source guards", () => {
  it("projects.post.js does not insert classification_ready notifications", () => {
    const src = read("server/routes/projects/projects.post.js");
    expect(src).not.toMatch(/'classification_ready'/);
    expect(src).not.toMatch(/Project insights are ready/);
  });

  it("project.put.js does not insert classification_ready notifications", () => {
    const src = read("server/routes/projects/project.put.js");
    expect(src).not.toMatch(/'classification_ready'/);
    expect(src).not.toMatch(/Project insights updated/);
  });

  it("signup.post.js does not call notifyNewSignupOfLocalProjects", () => {
    const src = read("server/routes/auth/signup.post.js");
    expect(src).not.toMatch(/notifyNewSignupOfLocalProjects\s*\(/);
  });

  it("account.post.js does not call notifyNewSignupOfLocalProjects", () => {
    const src = read("server/routes/account/account.post.js");
    expect(src).not.toMatch(/notifyNewSignupOfLocalProjects\s*\(/);
  });

  // Removed 2026-05: when a homeowner posts a project we no longer
  // notify other homeowners in the same area. Tradespeople still get
  // matched-job notifications via notifyMatchedTradesmen, and people who
  // recommended a trade on the project still get the project_live_local
  // notification - just not random homeowner neighbours.
  it("publishNotifications.js does not query users by area for project_live_local", () => {
    const src = read("server/lib/publishNotifications.js");
    // The old code path queried `users u WHERE (areaWhere)` to collect
    // every homeowner in the same area. If anyone reintroduces it, this
    // test fails - a much lighter guard than mocking the whole pipeline.
    expect(src).not.toMatch(/areaUsers\s*=\s*areaUserRows/);
    expect(src).not.toMatch(/SELECT u\.uid AS uid\s+FROM users u\s+WHERE \(\$\{areaWhere\}\)/);
  });
});
