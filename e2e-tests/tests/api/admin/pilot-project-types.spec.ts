// e2e-tests/tests/api/admin/pilot-project-types.spec.ts
//
// Exercises the admin pilot-project-types API end-to-end against a real
// MySQL-backed server. Covers:
//
//   - GET lists all leaves grouped by category with persisted enabled state
//   - PATCH on a single leaf updates only that leaf
//   - PATCH on a category bulk-toggles every leaf inside it
//   - Toggling round-trips: PATCH off -> GET reflects -> PATCH on -> GET reflects
//
// We deliberately don't assert against /api/pilot/project-types (the public
// picker endpoint) here because CI sets PILOT_PROJECT_TYPES_OPEN=1 to keep
// the existing UI tests' disabled-category flows working - the public
// endpoint would always return everything enabled and mask real DB state.
// The UI-side greying behaviour is covered by the component tests under
// tests/web/components/.

import { test, expect } from "../../../src/fixtures";

const TEST_CATEGORY = "Bedroom"; // disabled by default at launch
const TEST_LEAF = "Bedroom Refurbishment (Full)";

test.describe("Admin pilot project-types API", () => {
  test("GET lists every leaf with category + enabled flag", async ({
    adminApiClient,
  }) => {
    const res = await adminApiClient.get("/api/admin/pilot-project-types");
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.types)).toBe(true);
    expect(body.types.length).toBeGreaterThan(50);

    const row = body.types.find((t: any) => t.typeName === TEST_LEAF);
    expect(row).toBeTruthy();
    expect(row.category).toBe(TEST_CATEGORY);
    expect(typeof row.enabled).toBe("boolean");
  });

  test("PATCH on a category bulk-toggles every leaf in it", async ({
    adminApiClient,
  }) => {
    // Pre-flight: capture current state so we can restore afterwards.
    const before = await adminApiClient
      .get("/api/admin/pilot-project-types")
      .then((r) => r.json());
    const categoryLeaves = before.types.filter(
      (t: any) => t.category === TEST_CATEGORY,
    );
    expect(categoryLeaves.length).toBeGreaterThan(0);

    try {
      // Bulk-enable the whole category.
      const enableRes = await adminApiClient.patch(
        `/api/admin/pilot-project-types/category/${encodeURIComponent(TEST_CATEGORY)}`,
        { enabled: true },
      );
      expect(enableRes.status()).toBe(200);

      const afterEnable = await adminApiClient
        .get("/api/admin/pilot-project-types")
        .then((r) => r.json());
      const enabledLeaves = afterEnable.types.filter(
        (t: any) => t.category === TEST_CATEGORY,
      );
      expect(enabledLeaves.every((t: any) => t.enabled === true)).toBe(true);

      // Bulk-disable.
      const disableRes = await adminApiClient.patch(
        `/api/admin/pilot-project-types/category/${encodeURIComponent(TEST_CATEGORY)}`,
        { enabled: false },
      );
      expect(disableRes.status()).toBe(200);

      const afterDisable = await adminApiClient
        .get("/api/admin/pilot-project-types")
        .then((r) => r.json());
      const disabledLeaves = afterDisable.types.filter(
        (t: any) => t.category === TEST_CATEGORY,
      );
      expect(disabledLeaves.every((t: any) => t.enabled === false)).toBe(true);
    } finally {
      // Restore the original state regardless of test outcome so this
      // spec doesn't leave the shard in a different config than it
      // started.
      for (const leaf of categoryLeaves) {
        await adminApiClient.patch(
          `/api/admin/pilot-project-types/${encodeURIComponent(leaf.typeName)}`,
          { enabled: leaf.enabled },
        );
      }
    }
  });

  test("PATCH on a single leaf only flips that leaf", async ({
    adminApiClient,
  }) => {
    const before = await adminApiClient
      .get("/api/admin/pilot-project-types")
      .then((r) => r.json());
    const target = before.types.find((t: any) => t.typeName === TEST_LEAF);
    expect(target).toBeTruthy();
    const originalEnabled = target.enabled;
    const sibling = before.types.find(
      (t: any) => t.category === TEST_CATEGORY && t.typeName !== TEST_LEAF,
    );
    expect(sibling).toBeTruthy();
    const siblingOriginalEnabled = sibling.enabled;

    try {
      const patchRes = await adminApiClient.patch(
        `/api/admin/pilot-project-types/${encodeURIComponent(TEST_LEAF)}`,
        { enabled: !originalEnabled },
      );
      expect(patchRes.status()).toBe(200);

      const after = await adminApiClient
        .get("/api/admin/pilot-project-types")
        .then((r) => r.json());
      const targetAfter = after.types.find(
        (t: any) => t.typeName === TEST_LEAF,
      );
      const siblingAfter = after.types.find(
        (t: any) => t.typeName === sibling.typeName,
      );
      expect(targetAfter.enabled).toBe(!originalEnabled);
      // Sibling untouched - per-leaf PATCH must not bleed into the rest
      // of the category.
      expect(siblingAfter.enabled).toBe(siblingOriginalEnabled);
    } finally {
      await adminApiClient.patch(
        `/api/admin/pilot-project-types/${encodeURIComponent(TEST_LEAF)}`,
        { enabled: originalEnabled },
      );
    }
  });

  test("PATCH on an unknown leaf returns 404", async ({ adminApiClient }) => {
    const res = await adminApiClient.patch(
      `/api/admin/pilot-project-types/${encodeURIComponent("Totally Fake Trade")}`,
      { enabled: true },
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("unknown_project_type");
  });
});
