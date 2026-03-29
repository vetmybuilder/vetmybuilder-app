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
}

export default RecommendationApi;
