import { expect } from "@playwright/test";
import type { TradesmanStatus } from "../../types/tradesman";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
  del?: (path: string) => Promise<ApiResponse>;
};

/**
 * Hire-count breakdown asserted against by the leaderboard endpoints.
 *
 * `total` includes every status; `accepted`/`declined`/`pending` are the
 * three explicit breakdown fields the API returns. `cancelled` is derived
 * (= total - accepted - declined - pending) so callers can name it
 * positively in test expectations instead of asserting via arithmetic.
 */
export type ExpectedHireCounts = {
  total: number;
  accepted: number;
  declined: number;
  pending: number;
  cancelled?: number;
};

export class AdminApi {
  constructor(private readonly apiClient: ApiClient) {}

  // ─── Tradesman moderation ───────────────────────────────────────

  async setTradesmanStatus(
    userId: string,
    status: TradesmanStatus,
    assignTo?: string,
  ): Promise<void> {
    const payload: Record<string, string> = { status };
    if (assignTo) payload.assignTo = assignTo;

    const res = await this.apiClient.post(
      `/api/admin/tradesmen/${userId}/status`,
      payload,
    );
    expect(res.status()).toBe(200);
  }

  // ─── Feature flags ──────────────────────────────────────────────

  /** Toggle a feature flag on/off (clears the server cache server-side). */
  async setFeatureFlag(key: string, enabled: boolean): Promise<void> {
    const res = await this.apiClient.post(`/api/admin/feature-flags/${key}`, {
      enabled,
    });
    expect(res.status()).toBe(200);
  }

  // ─── Tradesmen leaderboard ──────────────────────────────────────

  async getTradesmenLeaderboard(): Promise<{ items: any[] }> {
    const res = await this.apiClient.get("/api/tradesmen/leaderboard");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    return body;
  }

  /** Find a single tradesman row in the leaderboard, asserting it exists. */
  async findTradesmanInLeaderboard(userId: string): Promise<any> {
    const { items } = await this.getTradesmenLeaderboard();
    const row = items.find((r) => r.userId === userId);
    expect(
      row,
      `Expected tradesman ${userId} to appear in the leaderboard`,
    ).toBeTruthy();
    return row;
  }

  /** Find every leaderboard row for a given company name (case-sensitive). */
  async findTradesmenInLeaderboardByCompany(company: string): Promise<any[]> {
    const { items } = await this.getTradesmenLeaderboard();
    return items.filter((r) => r.company === company);
  }

  /**
   * Asserts that exactly one leaderboard row exists for the given company
   * and that its `userId` matches `expectedUserId`. Used by the
   * promoted-lead audit-shadow tests where we want to be sure the
   * leaderboard de-duplication is working without leaking the assertion
   * shape into the spec.
   */
  async expectSingleLeaderboardRowForCompany(
    company: string,
    expected: { userId: string },
  ): Promise<void> {
    const matching = await this.findTradesmenInLeaderboardByCompany(company);
    expect(
      matching,
      `Expected exactly one leaderboard row for "${company}", got ${matching.length}`,
    ).toHaveLength(1);
    expect(matching[0].userId).toBe(expected.userId);
  }

  /**
   * Asserts the hire-count breakdown for a tradesman on the leaderboard.
   * Pass only the fields you care about; missing fields are not checked.
   */
  async expectTradesmanHireCounts(
    userId: string,
    expected: ExpectedHireCounts,
  ): Promise<void> {
    const row = await this.findTradesmanInLeaderboard(userId);
    const actual = readHireCounts(row);
    assertHireCounts(actual, expected, `tradesman ${userId}`);
  }

  // ─── Recommendation leaderboard ─────────────────────────────────

  async getRecommendationLeaderboard(): Promise<{ items: any[] }> {
    const res = await this.apiClient.get(
      "/api/admin/recommendation-leaderboard",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    return body;
  }

  /** Find a single recommendation row by id, asserting it exists. */
  async findRecommendationInLeaderboard(
    recommendationId: number,
  ): Promise<any> {
    const { items } = await this.getRecommendationLeaderboard();
    const row = items.find((r) => r.id === recommendationId);
    expect(
      row,
      `Expected recommendation ${recommendationId} to appear in the leaderboard`,
    ).toBeTruthy();
    return row;
  }

  /** Asserts the hire-count breakdown for a recommendation row. */
  async expectRecommendationHireCounts(
    recommendationId: number,
    expected: ExpectedHireCounts,
  ): Promise<void> {
    const row = await this.findRecommendationInLeaderboard(recommendationId);
    const actual = readHireCounts(row);
    assertHireCounts(actual, expected, `recommendation ${recommendationId}`);
  }

  /** Returns the canonical score the leaderboard endpoint computed for a row. */
  async getRecommendationScore(recommendationId: number): Promise<number> {
    const row = await this.findRecommendationInLeaderboard(recommendationId);
    expect(typeof row.score).toBe("number");
    return row.score;
  }

  // ─── Admin projects ───────────────────────────────────────────────

  async getProjects(query?: string): Promise<{ items: any[]; total: number }> {
    const qs = query ? `?${query}` : "";
    const res = await this.apiClient.get(`/api/admin/projects${qs}`);
    expect(res.status()).toBe(200);
    return res.json();
  }

  async deleteProject(projectId: number): Promise<void> {
    if (!this.apiClient.del) throw new Error("ApiClient missing del method");
    const res = await this.apiClient.del(`/api/admin/projects/${projectId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  }

  async expectProjectNotInList(projectId: number): Promise<void> {
    const { items } = await this.getProjects();
    const found = items.find((p) => p.id === projectId);
    expect(found, `Project ${projectId} should not appear in admin list`).toBeFalsy();
  }

  async expectProjectInList(projectId: number): Promise<any> {
    const { items } = await this.getProjects();
    const found = items.find((p) => p.id === projectId);
    expect(found, `Project ${projectId} should appear in admin list`).toBeTruthy();
    return found;
  }

  // ─── Admin user delete ────────────────────────────────────────────

  async deleteUser(uid: string): Promise<void> {
    if (!this.apiClient.del) throw new Error("ApiClient missing del method");
    const res = await this.apiClient.del(`/api/admin/users/${uid}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  }
}

// ─── private helpers ──────────────────────────────────────────────

function readHireCounts(row: any): Required<ExpectedHireCounts> {
  const total = Number(row?.hires?.total ?? 0);
  const accepted = Number(row?.hires?.accepted ?? 0);
  const declined = Number(row?.hires?.declined ?? 0);
  const pending = Number(row?.hires?.pending ?? 0);
  const cancelled = total - accepted - declined - pending;
  return { total, accepted, declined, pending, cancelled };
}

function assertHireCounts(
  actual: Required<ExpectedHireCounts>,
  expected: ExpectedHireCounts,
  label: string,
): void {
  expect(actual.total, `${label} hires.total`).toBe(expected.total);
  expect(actual.accepted, `${label} hires.accepted`).toBe(expected.accepted);
  expect(actual.declined, `${label} hires.declined`).toBe(expected.declined);
  expect(actual.pending, `${label} hires.pending`).toBe(expected.pending);
  if (expected.cancelled !== undefined) {
    expect(actual.cancelled, `${label} hires.cancelled`).toBe(
      expected.cancelled,
    );
  }
}

export default AdminApi;
