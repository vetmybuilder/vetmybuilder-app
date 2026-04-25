// e2e-tests/tests/ui/swipe-matching.spec.ts
//
// Smoke test for the Plan 3 swipe-matching flow.
//
// Scope (Path B — scoped-down):
//   1. Homeowner creates a project (API).
//   2. A builder is seeded and linked as a "recommended" candidate via DB.
//   3. Homeowner visits /projects/:id/shortlist on a mobile viewport and
//      right-swipes the builder through the SwipeDeck UI.
//   4. We assert a pending swipe_interest row was created.
//   5. The builder accepts via API — the tradesman/matches UI currently
//      POSTs to a path the server doesn't expose (/api/swipe/respond vs
//      /api/swipe-interest/:id/respond), so driving this via the UI isn't
//      possible today. Using the API keeps the smoke green and proves
//      the backend half of the match flow end-to-end.
//   6. The homeowner navigates to /match/:matchId and we assert the
//      celebration page renders with the builder's contact info.
//
// Deferred (would need new helpers + a client bugfix):
//   - Driving the tradesman's accept through the /tradesman/matches UI
//     once the endpoint mismatch is fixed.
//   - Asserting the homeowner is auto-navigated from SwipeDeck → /match/:id
//     (blocked by /api/projects/:id/swipe returning status="pending" on a
//      right-swipe — the deck's onMatch handler never fires).

import { test } from "../../src/ui.fixtures";
import { authedApiForUid } from "../../src/api/services/client";
import Project from "../../src/models/Project";
import Tradesman from "../../src/models/tradesman";

test.describe("Swipe-matching smoke", () => {
  test("homeowner right-swipes a recommended builder and the match page renders", async ({
    request,
    runtime,
    apiClient,
    projectApi,
    swipeMatchingApi,
    swipeDeckPage,
    matchPage,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("ui-mobile-"),
      "SwipeDeck is rendered mobile-only (md:hidden on /projects/:id/shortlist)",
    );
    test.setTimeout(120_000);

    // ── 1. Homeowner creates a project (location E4 drives the outward
    //      match against the builder's service area). ──
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    // ── 2. Seed a builder with a matching service area + trade, and link
    //      them to the project as a "recommended" candidate. ──
    const builderUid = `e2e-swipe-builder-${Date.now()}`;
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderUid,
    );

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName("Swipe Smoke Builders Ltd");
    // Ensure the builder matches the project's outward code so
    // /api/projects/:id/matches classifies them as eligible even without
    // an AI classification row. `tradesmen.service_areas` is a CSV string.
    tradesman.serviceAreas = "E4";
    tradesman.tradeTypes = "plumbing";
    tradesman.email = `swipe-smoke+${Date.now()}@test.com`;
    tradesman.phone = "07700900111";

    await builderClient.put("/api/tradesmen/me", tradesman.toPayload());

    await swipeMatchingApi.linkTradesmanToProject({
      projectId: Number(created.id),
      tradesmanUid: builderUid,
      company: tradesman.companyName,
    });

    // Seed a classification so the builder's primary trade also scores.
    // The area-match alone is sufficient for eligibility, but the
    // classification mirrors a realistic production state.
    await swipeMatchingApi.classifyProject({
      projectId: Number(created.id),
      recommendedTrades: ["plumbing"],
    });

    // ── 3. Homeowner visits the shortlist and right-swipes the top card. ──
    await swipeDeckPage.visitForProject(created.id);
    await swipeDeckPage.hasRenderedDeck();
    await swipeDeckPage.tapLike();

    // ── 4. The swipe creates a pending swipe_interest row. ──
    const interest = await swipeMatchingApi.waitForSwipeInterest({
      projectId: Number(created.id),
      builderUid,
      expectedStatus: "pending",
    });

    // ── 5. Builder accepts via the API (UI wiring bug — see header). ──
    await swipeMatchingApi.builderAcceptsMatch(builderClient, interest.id);

    // ── 6. Homeowner lands on the celebration page and sees builder info. ──
    await swipeMatchingApi.hasMatchContactFor(apiClient, interest.id, {
      builderNameContains: "Swipe Smoke Builders",
      emailContains: "swipe-smoke",
    });

    await matchPage.visit(interest.id);
    await matchPage.hasCelebrationHeading();
    await matchPage.showsBuilderName("Swipe Smoke Builders");
    await matchPage.showsEmailCta();
    await matchPage.showsCallCta();
  });
});
