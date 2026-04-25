// e2e-tests/src/apiHelper/swipeMatching/SwipeMatchingApi.ts
//
// Helpers for the Plan 3 swipe-matching flow. Combines direct DB seeding
// (for rows the product only ever writes as a side-effect of AI/pipeline
// work — project_classifications, recommendations.linked_tradesman_uid)
// with thin wrappers over the public API endpoints that drive the flow.
//
// Purpose: keep swipe-matching specs focused on assertions, not plumbing.

import { expect } from "@playwright/test";
import { connect } from "../../db/mysql";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
};

export class SwipeMatchingApi {
  constructor(private readonly dbName: string) {}

  // ─── Direct DB seeding ─────────────────────────────────────────

  /**
   * Insert a recommendation row pre-linked to a tradesman. This mirrors the
   * end-state produced by the recommendation→tradesman matcher, letting the
   * swipe deck pick the builder up as a "recommended" candidate without
   * waiting on the async signaller/CH verification pipelines.
   */
  async linkTradesmanToProject(params: {
    projectId: number;
    tradesmanUid: string;
    recommenderUid?: string;
    company: string;
  }): Promise<number> {
    const conn = await this.connectDb();
    try {
      const [result] = await conn.query(
        `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, company, rating,
            comment, isAnonymous, source, linked_tradesman_uid)
         VALUES (?, ?, NOW(), 'Jane Doe', ?, 5,
                 'Great work', 0, 'platform', ?)`,
        [
          params.projectId,
          params.recommenderUid ?? null,
          params.company,
          params.tradesmanUid,
        ],
      );
      return (result as any).insertId as number;
    } finally {
      await conn.end();
    }
  }

  /**
   * Insert a minimal project_classifications row. The swipe-deck matcher
   * falls back to area matching when classification is absent, but callers
   * who want to exercise the trade-match path can seed it explicitly.
   */
  async classifyProject(params: {
    projectId: number;
    recommendedTrades: string[];
  }): Promise<void> {
    const conn = await this.connectDb();
    try {
      await conn.query(
        `INSERT INTO project_classifications
           (project_id, classifier_version, raw_description, structured,
            cost_pence, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          params.projectId,
          "e2e-test",
          "seeded for swipe-matching smoke test",
          JSON.stringify({
            recommended_trades: params.recommendedTrades,
          }),
          0,
          0,
        ],
      );
    } finally {
      await conn.end();
    }
  }

  // ─── Named DB queries ──────────────────────────────────────────

  /**
   * Fetch the swipe_interest row that exists for a (project, builder) pair.
   * Polls so specs don't have to reason about UI→API latency after a swipe.
   */
  async waitForSwipeInterest(params: {
    projectId: number;
    builderUid: string;
    expectedStatus?: "pending" | "matched";
  }): Promise<{ id: number; status: string }> {
    let found: { id: number; status: string } | null = null;

    await expect
      .poll(
        async () => {
          const conn = await this.connectDb();
          try {
            const [rows] = await conn.query(
              `SELECT id, status FROM swipe_interest
                 WHERE project_id = ? AND builder_uid = ?
                 LIMIT 1`,
              [params.projectId, params.builderUid],
            );
            const row = (rows as any[])[0];
            if (!row) return false;
            if (
              params.expectedStatus &&
              row.status !== params.expectedStatus
            ) {
              return false;
            }
            found = { id: Number(row.id), status: String(row.status) };
            return true;
          } finally {
            await conn.end();
          }
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
   * Builder side: accept an incoming pending swipe_interest. The production
   * UI (tradesman/matches) currently POSTs to the wrong path — so the smoke
   * test drives this via the API directly to confirm the match can be
   * formed end-to-end once the client bug is fixed.
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

  // ─── Private ───────────────────────────────────────────────────

  private async connectDb() {
    return connect({
      host: process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || "root",
      password: process.env.TEST_DB_PASSWORD || "",
      database: this.dbName,
    });
  }
}

export default SwipeMatchingApi;
