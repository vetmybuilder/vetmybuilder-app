// e2e-tests/src/apiHelper/swipeMatching/SwipeMatchingApi.ts
//
// Helpers for the Plan 3 swipe-matching flow. Wraps the public swipe API
// plus a small set of __test__ seeding endpoints
// (server/routes/__test__/swipe-matching.js) so specs can pin the
// pre-swipe end-state (linked recommendation, classification, matched
// swipe_interest) without driving the full AI / matcher / mutual-swipe
// pipelines.
//
// All HTTP is done through an ApiClient - this helper holds no DB
// connection.

import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
  text(): Promise<string>;
};

type ApiClient = {
  get: (path: string) => Promise<ApiResponse>;
  post: (path: string, payload?: any) => Promise<ApiResponse>;
};

export type SwipeInterestStatus =
  | "pending"
  | "matched"
  | "declined_by_homeowner"
  | "declined_by_builder"
  | "expired";

export class SwipeMatchingApi {
  constructor(private readonly apiClient: ApiClient) {}

  // ─── Seeding (via __test__ endpoints) ──────────────────────────

  /**
   * Insert a recommendation row pre-linked to a tradesman. Mirrors the
   * end-state produced by the recommendation→tradesman matcher, letting
   * the swipe deck pick the builder up as a "recommended" candidate
   * without waiting on the async signaller / CH verification pipelines.
   */
  async linkTradesmanToProject(params: {
    projectId: number;
    tradesmanUid: string;
    recommenderUid?: string;
    company: string;
  }): Promise<number> {
    const res = await this.apiClient.post(
      `/api/__test__/recommendations/link-tradesman`,
      {
        projectId: params.projectId,
        tradesmanUid: params.tradesmanUid,
        recommenderUid: params.recommenderUid ?? null,
        company: params.company,
      },
    );
    await assertOk(res, "linkTradesmanToProject");
    const body = await res.json();
    return Number(body.recommendationId);
  }

  /**
   * Seed a swipe_interest row pre-set to 'matched' for
   * (projectId, builderUid). Use when a spec needs a matched
   * tradesperson to exist without driving the homeowner-swipe →
   * builder-accept flow.
   */
  async seedMatchedSwipeInterest(params: {
    projectId: number;
    homeownerUid: string;
    builderUid: string;
  }): Promise<number> {
    const res = await this.apiClient.post(`/api/__test__/swipe-interest`, {
      projectId: params.projectId,
      homeownerUid: params.homeownerUid,
      builderUid: params.builderUid,
      source: "recommended",
      status: "matched",
    });
    await assertOk(res, "seedMatchedSwipeInterest");
    const body = await res.json();
    return Number(body.id);
  }

  /**
   * Insert a minimal project_classifications row. Callers who want to
   * exercise the trade-match path (subscribed candidates) can seed it
   * explicitly; the recommended path doesn't need it because matches.get
   * overrides classification with the canonical project-type→trade map.
   */
  async classifyProject(params: {
    projectId: number;
    recommendedTrades: string[];
  }): Promise<void> {
    const res = await this.apiClient.post(
      `/api/__test__/project-classifications`,
      {
        projectId: params.projectId,
        recommendedTrades: params.recommendedTrades,
      },
    );
    await assertOk(res, "classifyProject");
  }

  /**
   * Seed a boosted closure for a tradesperson on a (throwaway) project.
   * Produces the same end-state the real close-job + Boost flow would:
   * `project_closures.winner_tradesman_uid` set, `boost_consent = 1`,
   * optional closure photos. Powers the "Top tradesperson" chip and the
   * "Recently completed in {area}" band on the swipe deck.
   */
  async seedBoostedClosure(params: {
    projectId: number;
    winnerTradesmanUid: string;
    photoPaths?: string[];
  }): Promise<void> {
    const res = await this.apiClient.post(`/api/__test__/project-closures`, {
      projectId: params.projectId,
      winnerTradesmanUid: params.winnerTradesmanUid,
      boostConsent: true,
      photoPaths: params.photoPaths ?? [],
    });
    await assertOk(res, "seedBoostedClosure");
  }

  // ─── Named API queries ─────────────────────────────────────────

  /**
   * Poll the test endpoint until a swipe_interest row exists (optionally
   * at a specific status) for (project, builder). Lets specs avoid
   * reasoning about UI→API latency after a swipe.
   */
  async waitForSwipeInterest(params: {
    projectId: number;
    builderUid: string;
    expectedStatus?: SwipeInterestStatus;
  }): Promise<{ id: number; status: string }> {
    let found: { id: number; status: string } | null = null;

    await expect
      .poll(
        async () => {
          const res = await this.apiClient.get(
            `/api/__test__/swipe-interest?projectId=${params.projectId}` +
              `&builderUid=${encodeURIComponent(params.builderUid)}`,
          );
          if (res.status() !== 200) return false;
          const body = await res.json();
          const row = body?.row;
          if (!row) return false;
          if (params.expectedStatus && row.status !== params.expectedStatus) {
            return false;
          }
          found = { id: Number(row.id), status: String(row.status) };
          return true;
        },
        {
          timeout: 15_000,
          intervals: [250, 500, 1000, 2000],
          message: "swipe_interest row did not appear in time",
        },
      )
      .toBe(true);

    return found!;
  }

  // ─── Public API wrappers ───────────────────────────────────────

  /**
   * Builder side: accept an incoming pending swipe_interest. The
   * production UI (tradesman/matches) currently POSTs to the wrong path
   * - so the smoke test drives this via the API directly to confirm the
   * match can be formed end-to-end once the client bug is fixed.
   */
  async builderAcceptsMatch(
    builderClient: ApiClient,
    swipeInterestId: number,
  ): Promise<void> {
    const res = await builderClient.post(
      `/api/swipe-interest/${swipeInterestId}/respond`,
      { direction: "right" },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("matched");
  }

  async builderDeclinesMatch(
    builderClient: ApiClient,
    swipeInterestId: number,
  ): Promise<void> {
    const res = await builderClient.post(
      `/api/swipe-interest/${swipeInterestId}/respond`,
      { direction: "left" },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("declined_by_builder");
  }

  /**
   * Named assertion: GET /api/matches/:matchId succeeds and returns the
   * expected counter-party contact info for the authenticated viewer.
   */
  async hasMatchContactFor(
    viewerClient: ApiClient,
    matchId: number,
    expected: { builderNameContains?: string; emailContains?: string },
  ): Promise<void> {
    const res = await viewerClient.get(`/api/matches/${matchId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body?.match).toBeTruthy();
    if (expected.builderNameContains) {
      expect(String(body.match.builderName || "")).toContain(
        expected.builderNameContains,
      );
    }
    if (expected.emailContains) {
      expect(String(body.match.email || "")).toContain(expected.emailContains);
    }
  }
}

async function assertOk(res: ApiResponse, label: string): Promise<void> {
  if (res.status() >= 200 && res.status() < 300) return;
  const body = await res.text().catch(() => "");
  throw new Error(`${label}: ${res.status()}\n${body || "(no body)"}`);
}

export default SwipeMatchingApi;
