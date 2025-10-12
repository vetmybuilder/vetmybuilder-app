import {
  expect,
  request as pwRequest,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";

export type RecommendationPhotoInput = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

export type RecommendationInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  company: string;
  rating?: number | null;
  comment: string;
  // tolerated extras (ignored by backend if present)
  hireAgain?: boolean | null;
  source?: string | null;
  // optional photos; we’ll upload the FIRST one to trigger gallery UI
  photos?: RecommendationPhotoInput[] | null;
};

class RecommendationsApi {
  private request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  /** Build an API client bound to a bearer idToken. */
  static async fromIdToken(idToken: string, baseURL: string = API_BASE) {
    const ctx = await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    return new RecommendationsApi(ctx);
  }

  /** Robustly extract the created recommendation ID from several possible shapes. */
  private async extractId(res: APIResponse): Promise<number> {
    const text = await res.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        `Expected JSON from recommendations endpoint. Got: ${res.status()} ${text}`
      );
    }

    // Server returns: { ok: true, recommendationId }
    const id =
      body?.recommendationId ?? body?.recommendation?.id ?? body?.id ?? null;

    expect(
      typeof id === "number",
      `Failed to parse created recommendation id from response: ${text}`
    ).toBeTruthy();

    return id as number;
  }

  /** JSON path (no photos). */
  private async createJSON(
    projectId: number,
    input: RecommendationInput
  ): Promise<number> {
    const res = await this.request.post(
      `/api/projects/${projectId}/recommendations`,
      {
        headers: { "Content-Type": "application/json" },
        data: {
          name: input.name,
          email: input.email ?? undefined,
          phone: input.phone ?? undefined,
          company: input.company,
          rating: input.rating ?? 5,
          comment: input.comment,
          ...(input.source ? { source: input.source } : {}),
        },
      }
    );

    expect(
      res.ok(),
      `Failed to create recommendation: ${await res.text()}`
    ).toBeTruthy();

    return await this.extractId(res);
  }

  /**
   * Multipart path (with photos).
   * Playwright sends *one* file per field; we attach the FIRST photo under the "photos" field
   * (server uses `upload.array("photos", 8)`).
   */
  private async createWithPhoto(
    projectId: number,
    input: RecommendationInput,
    photo: RecommendationPhotoInput
  ): Promise<number> {
    const res = await this.request.post(
      `/api/projects/${projectId}/recommendations`,
      {
        multipart: {
          // text fields
          name: input.name,
          email: input.email ?? "",
          phone: input.phone ?? "",
          company: input.company,
          rating: String(input.rating ?? 5),
          comment: input.comment,
          ...(input.source ? { source: input.source } : {}),
          // single file
          photos: {
            name: photo.name,
            mimeType: photo.mimeType,
            buffer: photo.buffer,
          },
        } as any,
      }
    );

    expect(
      res.ok(),
      `Failed to create recommendation (multipart): ${await res.text()}`
    ).toBeTruthy();

    return await this.extractId(res);
  }

  /**
   * Single entry creator that smartly picks JSON or multipart based on `photos`.
   * - With photos -> uploads the FIRST photo.
   * - Without photos -> plain JSON.
   */
  async createSmart(
    projectId: number,
    input: RecommendationInput
  ): Promise<number> {
    const firstPhoto =
      Array.isArray(input.photos) && input.photos.length > 0
        ? input.photos[0]
        : null;

    if (firstPhoto) {
      return this.createWithPhoto(projectId, input, firstPhoto);
    }
    return this.createJSON(projectId, input);
  }

  /** Like a recommendation as the current (token-bound) user. */
  async like(recommendationId: number): Promise<void> {
    const res = await this.request.post(
      `/api/recommendations/${recommendationId}/like`
    );
    expect(
      res.ok(),
      `Failed to like recommendation ${recommendationId}: ${await res.text()}`
    ).toBeTruthy();
  }

  /** Convenience: like many ids sequentially. */
  async likeMany(ids: number[]): Promise<void> {
    for (const id of ids) {
      await this.like(id);
    }
  }

  /**
   * Create many recommendations sequentially (keeps test flake low),
   * choosing JSON vs multipart automatically, then auto-like each one
   * (so UI shows ♥ 1).
   */
  async createManySmart(
    projectId: number,
    items: RecommendationInput[]
  ): Promise<number[]> {
    const ids: number[] = [];
    for (const it of items) {
      const id = await this.createSmart(projectId, it);
      ids.push(id);
    }
    await this.likeMany(ids);
    return ids;
  }

  /* -------- Back-compat: keep old names if you want -------- */

  /** Old name that used JSON-only path (now smart). */
  async create(projectId: number, input: RecommendationInput): Promise<number> {
    return this.createSmart(projectId, input);
  }

  /** Old name that created many (now smart + auto-like). */
  async createMany(
    projectId: number,
    items: RecommendationInput[]
  ): Promise<number[]> {
    return this.createManySmart(projectId, items);
  }
}

export default RecommendationsApi;
