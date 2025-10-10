import type { APIRequestContext, APIResponse } from "@playwright/test";

export class ApiBase {
  protected request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  protected get baseUrl(): string {
    return process.env.E2E_API_BASE || "http://localhost:8787";
  }

  protected get authHeaders(): Record<string, string> {
    const secret = process.env.E2E_TEST_SECRET || "";
    return secret ? { "X-Test-Secret": secret } : {};
  }

  protected async postJSON(path: string, data?: unknown): Promise<APIResponse> {
    return this.request.post(`${this.baseUrl}${path}`, {
      data,
      headers: { "Content-Type": "application/json", ...this.authHeaders },
    });
  }
}
