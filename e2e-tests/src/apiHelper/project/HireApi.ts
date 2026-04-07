// e2e-tests/src/apiHelper/project/HireApi.ts
//
// API helper for the hires endpoints. Mirrors the shape of RecommendationApi:
// happy-path methods do POST + sane assertions, validation-error helper covers
// the field-level Zod check pattern. Tests that need to assert specific
// non-201 statuses (e.g. 403, 409) should call this class's `createHireRaw`
// helper which returns the raw response without asserting.

import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
  patch: (path: string, payload?: any) => Promise<ApiResponse>;
};

export type AcceptHirePayload = {
  tradesmanMessage?: string;
};

export type DeclineHirePayload = {
  tradesmanMessage?: string;
};

export type CancelHirePayload = {
  cancelReason?: string;
};

export type CreateHirePayload = {
  tradesmanUserId?: string;
  recommendationId?: number;
  homeownerMessage?: string;
};

export class HireApi {
  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Happy-path create. Asserts a 201 and returns the `hire` object from the
   * response body.
   */
  async createHire(projectId: string | number, payload: CreateHirePayload) {
    const res = await this.apiClient.post(
      `/api/projects/${projectId}/hires`,
      payload,
    );
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hire).toBeTruthy();
    expect(body.hire.id).toBeTruthy();

    return body.hire;
  }

  /**
   * POSTs without asserting. Use when the test needs to inspect a non-201
   * status / body shape (e.g. 403, 404, 409 error codes).
   */
  async createHireRaw(
    projectId: string | number,
    payload: CreateHirePayload,
  ) {
    return this.apiClient.post(`/api/projects/${projectId}/hires`, payload);
  }

  /**
   * GETs all hires for a project (project-owner-only endpoint). Asserts 200
   * and returns the parsed body — `{ items, total }`.
   */
  async listHires(projectId: string | number) {
    const res = await this.apiClient.get(`/api/projects/${projectId}/hires`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");

    return body as { items: any[]; total: number };
  }

  /**
   * GETs without asserting. Use when the test needs to inspect a non-200
   * status (e.g. 403 forbidden, 404 not found).
   */
  async listHiresRaw(projectId: string | number) {
    return this.apiClient.get(`/api/projects/${projectId}/hires`);
  }

  /**
   * GETs the calling tradesman's incoming hire requests. Asserts 200 and
   * returns the parsed body — `{ items, total }`.
   *
   * The api client must be authenticated as the tradesman whose hires are
   * being fetched (i.e. constructed via authedApiForUid for that uid).
   */
  async listMyHires() {
    const res = await this.apiClient.get(`/api/tradesmen/me/hires`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");

    return body as { items: any[]; total: number };
  }

  /**
   * GET /api/tradesmen/me/hires without asserting — for tests that expect
   * non-200 statuses (e.g. 403 when caller isn't a tradesman).
   */
  async listMyHiresRaw() {
    return this.apiClient.get(`/api/tradesmen/me/hires`);
  }

  /**
   * Tradesman accepts a hire. Asserts 200 and returns the `hire` object
   * from the response body.
   */
  async acceptHire(hireId: string | number, payload: AcceptHirePayload = {}) {
    const res = await this.apiClient.patch(
      `/api/hires/${hireId}/accept`,
      payload,
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hire).toBeTruthy();
    expect(body.hire.id).toBe(Number(hireId));

    return body.hire;
  }

  /**
   * PATCHes /accept without asserting. Use when the test needs to inspect a
   * non-200 status (e.g. 403, 404, 409).
   */
  async acceptHireRaw(
    hireId: string | number,
    payload: AcceptHirePayload = {},
  ) {
    return this.apiClient.patch(`/api/hires/${hireId}/accept`, payload);
  }

  /**
   * PATCHes /accept and asserts a Zod validation error containing an issue
   * for the given field.
   */
  async expectAcceptValidationErrorForField(
    hireId: string | number,
    payload: AcceptHirePayload,
    field: string,
  ): Promise<void> {
    const res = await this.apiClient.patch(
      `/api/hires/${hireId}/accept`,
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

  /**
   * Tradesman declines a hire. Asserts 200 and returns the `hire` object
   * from the response body.
   */
  async declineHire(hireId: string | number, payload: DeclineHirePayload = {}) {
    const res = await this.apiClient.patch(
      `/api/hires/${hireId}/decline`,
      payload,
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hire).toBeTruthy();
    expect(body.hire.id).toBe(Number(hireId));

    return body.hire;
  }

  /**
   * PATCHes /decline without asserting. Use when the test needs to inspect a
   * non-200 status (e.g. 403, 404, 409).
   */
  async declineHireRaw(
    hireId: string | number,
    payload: DeclineHirePayload = {},
  ) {
    return this.apiClient.patch(`/api/hires/${hireId}/decline`, payload);
  }

  /**
   * PATCHes /decline and asserts a Zod validation error containing an issue
   * for the given field.
   */
  async expectDeclineValidationErrorForField(
    hireId: string | number,
    payload: DeclineHirePayload,
    field: string,
  ): Promise<void> {
    const res = await this.apiClient.patch(
      `/api/hires/${hireId}/decline`,
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

  /**
   * Homeowner cancels a hire. Asserts 200 and returns the `hire` object
   * from the response body. The api client must be authenticated as the
   * project owner.
   */
  async cancelHire(hireId: string | number, payload: CancelHirePayload = {}) {
    const res = await this.apiClient.patch(
      `/api/hires/${hireId}/cancel`,
      payload,
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hire).toBeTruthy();
    expect(body.hire.id).toBe(Number(hireId));

    return body.hire;
  }

  /**
   * PATCHes /cancel without asserting. Use when the test needs to inspect a
   * non-200 status (e.g. 400, 403, 404, 409).
   */
  async cancelHireRaw(
    hireId: string | number,
    payload: CancelHirePayload = {},
  ) {
    return this.apiClient.patch(`/api/hires/${hireId}/cancel`, payload);
  }

  /**
   * PATCHes /cancel and asserts a Zod validation error containing an issue
   * for the given field.
   */
  async expectCancelValidationErrorForField(
    hireId: string | number,
    payload: CancelHirePayload,
    field: string,
  ): Promise<void> {
    const res = await this.apiClient.patch(
      `/api/hires/${hireId}/cancel`,
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

  /**
   * POSTs the payload and asserts a Zod validation error containing an issue
   * for the given field. Same pattern as RecommendationApi.
   */
  async expectValidationErrorForField(
    projectId: string | number,
    payload: CreateHirePayload,
    field: string,
  ): Promise<void> {
    const res = await this.apiClient.post(
      `/api/projects/${projectId}/hires`,
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

export default HireApi;
