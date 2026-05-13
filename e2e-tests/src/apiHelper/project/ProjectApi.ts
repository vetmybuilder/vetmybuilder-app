import { expect } from "@playwright/test";
import Project from "../../models/Project";
import { parseAnswersJson } from "../../utils/formatters";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  put: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
};

type CreateProjectOptions = {
  publish?: boolean;
};

export class ProjectApi {
  constructor(private readonly apiClient: ApiClient) {}

  async createProject(payload: any, opts: CreateProjectOptions = {}) {
    const res = await this.apiClient.post("/api/projects", payload);
    expect(res.status()).toBe(201);

    const body = await res.json();

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    const createdProject = body.project;

    if (opts.publish) {
      return this.publishProject(createdProject.id);
    }

    return createdProject;
  }

  async createProjectForLoggedInHomeowner(
    payload: any,
    opts?: CreateProjectOptions,
  ) {
    return this.createProject(payload, opts);
  }

  async createLiveProject(payload: any) {
    const project = await this.createProject(payload);
    return this.publishProject(project.id);
  }

  async createProjectRaw(payload: any) {
    const res = await this.apiClient.post("/api/projects", payload);
    const body = await res.json().catch(() => ({}));
    return { status: res.status(), body };
  }

  async updateProject(projectId: string | number, payload: any) {
    const res = await this.apiClient.put(`/api/projects/${projectId}`, payload);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.project).toBeTruthy();
    return body.project;
  }

  async getProject(projectId: string | number) {
    const res = await this.apiClient.get(`/api/projects/${projectId}`);
    if (res.status() !== 200) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `getProject(${JSON.stringify(projectId)}) failed: ` +
          `status=${res.status()} body=${JSON.stringify(body)}`,
      );
    }

    const body = await res.json();
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();

    return body.project;
  }

  async closeProject(
    projectId: string | number,
    options: {
      didGoAhead: boolean;
      reasons?: string[];
      // Winner identification (one of these, optional):
      winnerRecommendationId?: number | string;
      winnerTradesmanUid?: string;
      winnerOther?: boolean;
      // CR3 satisfaction + boost:
      satisfied?: "yes" | "no";
      overallRating?: number;
      ratings?: Record<string, number>;
      boostConsent?: boolean;
    },
  ) {
    const res = await this.apiClient.post(
      `/api/projects/${projectId}/close`,
      options,
    );
    expect(res.status()).toBe(200);
    return res.json();
  }

  async completeProject(
    projectId: string | number,
    opts: { winnerRecommendationId: number | string; wouldUseAgain?: boolean },
  ) {
    const res = await this.apiClient.post(`/api/projects/${projectId}/close`, {
      didGoAhead: true,
      winnerRecommendationId: opts.winnerRecommendationId,
      wouldUseAgain: opts.wouldUseAgain ?? true,
      reasons: [],
    });
    expect(res.status()).toBe(200);
    return res.json();
  }

  async getMagicLink(projectId: string | number): Promise<string> {
    const res = await this.apiClient.post(
      `/api/projects/${projectId}/magic-link`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    return body.token;
  }

  async waitForClassification(projectId: string | number) {
    let body: any = null;
    await expect
      .poll(
        async () => {
          const res = await this.apiClient.get(`/api/projects/${projectId}`);
          body = await res.json();
          return body?.classification != null;
        },
        { timeout: 10_000, intervals: [500] },
      )
      .toBe(true);
    return body;
  }

  async publishProject(projectId: string | number) {
    const res = await this.apiClient.post(`/api/projects/${projectId}/publish`);
    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.project).toBeTruthy();
    expect(body.project.id).toBeTruthy();
    expect(String(body.project.status || "").toLowerCase()).toBe("live");

    return body.project;
  }

  // ────────────────────────────────────────────────────────────
  // Off-platform recommendations + matches
  // ────────────────────────────────────────────────────────────

  async getOffPlatformRecommendations(projectId: string | number) {
    const res = await this.apiClient.get(
      `/api/projects/${projectId}/off-platform-recommendations`,
    );
    expect(res.status()).toBe(200);
    return res.json();
  }

  async getMatches(projectId: string | number) {
    const res = await this.apiClient.get(`/api/projects/${projectId}/matches`);
    expect(res.status()).toBe(200);
    return res.json();
  }

  async nudgeRecommendation(recommendationId: string | number) {
    return this.apiClient.post(
      `/api/recommendations/${recommendationId}/nudge`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // Named assertions — structured answers (category-specific fields)
  // ────────────────────────────────────────────────────────────

  /**
   * Asserts that the project's persisted answers_json matches the model's
   * current answers payload. Accepts an optional explicit expectation for
   * cases where the desired assertion doesn't match the original project
   * (e.g. after an edit).
   */
  async hasAnswers(
    projectId: string | number,
    expected: Project | ReturnType<Project["toAnswersPayload"]>,
  ) {
    const fetched = await this.getProject(projectId);
    const actual = parseAnswersJson(fetched.answers_json);
    const expectedAnswers =
      expected instanceof Project ? expected.toAnswersPayload() : expected;
    expect(actual).toEqual(expectedAnswers);
  }

  async hasNoAnswers(projectId: string | number) {
    const fetched = await this.getProject(projectId);
    expect(parseAnswersJson(fetched.answers_json)).toBeNull();
  }

  /**
   * Takes a valid Project + a raw malformed answers fragment keyed by group
   * id (e.g. `{ flooring: {...} }`, `{ insulation: {...} }`). The helper
   * assembles the full payload so specs stay focused on what they're
   * testing — the bad shape + the expected error path.
   */
  async rejectsCreateWithInvalidAnswers(
    project: Project,
    opts: {
      badAnswers: Record<string, Record<string, any>>;
      path: string;
      message?: RegExp;
    },
  ) {
    const payload = {
      ...project.toApiPayload(),
      answers: { _version: 1, ...opts.badAnswers },
    };

    const { status, body } = await this.createProjectRaw(payload);
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_answers");

    const detail = (body.details ?? []).find(
      (e: any) => e?.path === opts.path,
    );
    expect(
      detail,
      `expected an invalid_answers detail at path "${opts.path}"`,
    ).toBeTruthy();

    if (opts.message) {
      expect(detail.message).toMatch(opts.message);
    }
  }
}

export default ProjectApi;
