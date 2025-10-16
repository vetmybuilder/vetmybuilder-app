import {
  expect,
  request as pwRequest,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const API_PREFIX = process.env.E2E_API_PREFIX || "/api";

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
  hireAgain?: boolean | null;
  source?: string | null;
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
    const id =
      body?.recommendationId ?? body?.recommendation?.id ?? body?.id ?? null;
    expect(
      typeof id === "number",
      `Failed to parse created recommendation id from response: ${text}`
    ).toBeTruthy();
    return id as number;
  }

  private async createJSON(
    projectId: number,
    input: RecommendationInput
  ): Promise<number> {
    const res = await this.request.post(
      `${API_PREFIX}/projects/${projectId}/recommendations`,
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

  private async createWithPhoto(
    projectId: number,
    input: RecommendationInput,
    photo: RecommendationPhotoInput
  ): Promise<number> {
    const res = await this.request.post(
      `${API_PREFIX}/projects/${projectId}/recommendations`,
      {
        multipart: {
          name: input.name,
          email: input.email ?? "",
          phone: input.phone ?? "",
          company: input.company,
          rating: String(input.rating ?? 5),
          comment: input.comment,
          ...(input.source ? { source: input.source } : {}),
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

  async like(recommendationId: number): Promise<void> {
    const res = await this.request.post(
      `${API_PREFIX}/recommendations/${recommendationId}/like`
    );
    expect(
      res.ok(),
      `Failed to like recommendation ${recommendationId}: ${await res.text()}`
    ).toBeTruthy();
  }

  async likeMany(ids: number[]): Promise<void> {
    for (const id of ids) {
      await this.like(id);
    }
  }

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

  async create(projectId: number, input: RecommendationInput): Promise<number> {
    return this.createSmart(projectId, input);
  }

  async createMany(
    projectId: number,
    items: RecommendationInput[]
  ): Promise<number[]> {
    return this.createManySmart(projectId, items);
  }
}

export default RecommendationsApi;
