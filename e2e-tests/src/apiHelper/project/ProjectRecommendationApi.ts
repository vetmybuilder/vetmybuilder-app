import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
};

type CreateRecommendationOptions = {
  expectedStatus?: number;
};

export class RecommendationApi {
  constructor(private readonly apiClient: ApiClient) {}

  async createRecommendation(
    projectId: string | number,
    payload: any,
    opts: CreateRecommendationOptions = {},
  ) {
    const expectedStatus = opts.expectedStatus ?? 201;

    const res = await this.apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      payload,
    );

    expect(res.status()).toBe(expectedStatus);

    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.recommendationId).toBeTruthy();
    expect(body.resolvedCompany).toBeTruthy();
    expect(body.resolvedBy).toBeTruthy();
    expect(["db", "ch", "input"]).toContain(body.resolvedBy);

    expect(body.recommender).toBeTruthy();
    expect(["friend", "neighbour", "owner"]).toContain(
      body.recommender.relation,
    );
    expect(["platform", "magic"]).toContain(body.recommender.source);

    return body;
  }

  async createRecommendationForLoggedInUser(
    projectId: string | number,
    payload: any,
    opts?: CreateRecommendationOptions,
  ) {
    return this.createRecommendation(projectId, payload, opts);
  }

  async createRecommendationForGuestUser(
    projectId: string | number,
    payload: any,
    opts?: CreateRecommendationOptions,
  ) {
    return this.createRecommendation(projectId, payload, opts);
  }

  /**
   * POSTs the payload and asserts the API rejects it with a Zod validation
   * error containing an issue for the given field.
   *
   * Use this for tests that check field-level validation behaviour
   * (e.g. invalid email format on `companyEmail`) instead of hand-rolling
   * .find() against the issues array in every spec.
   */
  async expectValidationErrorForField(
    projectId: string | number,
    payload: any,
    field: string,
  ): Promise<void> {
    const res = await this.apiClient.post(
      `/api/projects/${projectId}/recommendations`,
      payload,
    );
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Invalid payload");
    expect(Array.isArray(body.issues)).toBe(true);

    const issue = body.issues.find(
      (i: any) => Array.isArray(i?.path) && i.path[0] === field,
    );
    expect(
      issue,
      `Expected a validation issue for field "${field}", but none was found in: ${JSON.stringify(body.issues)}`,
    ).toBeTruthy();
  }
}

export default RecommendationApi;
