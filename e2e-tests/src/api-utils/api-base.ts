import type { APIRequestContext, APIResponse } from "@playwright/test";

export class ApiBase {
  protected request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  protected get baseUrl(): string {
    return process.env.E2E_API_BASE || "http://localhost:8787";
  }

  protected get apiPrefix(): string {
    // e.g. "/api" or "/api/v2"
    return process.env.E2E_API_PREFIX || "/api";
  }

  protected get authHeaders(): Record<string, string> {
    const secret = process.env.E2E_TEST_SECRET || "";
    return secret ? { "X-Test-Secret": secret } : {};
  }

  /** Normalizes a path to include the API prefix exactly once. */
  protected withPrefix(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    // if caller already passed /api or /api/vX, don't double-prefix
    if (p.startsWith("/api")) return p;
    return `${this.apiPrefix}${p}`;
  }

  protected async postJSON(path: string, data?: unknown): Promise<APIResponse> {
    return this.request.post(`${this.baseUrl}${this.withPrefix(path)}`, {
      data,
      headers: { "Content-Type": "application/json", ...this.authHeaders },
    });
  }
}
