import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

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
  rating?: number | null; // 1..5 (server clamps)
  comment: string;
  source?: "magic" | "platform" | string | null;
  photos?: RecommendationPhotoInput[] | null; // multiple supported via browser fetch fallback
  hireAgain?:
    | boolean
    | 0
    | 1
    | "0"
    | "1"
    | "true"
    | "false"
    | "yes"
    | "no"
    | null;
};

type RequestLike = Pick<APIRequestContext, "get" | "post" | "put" | "delete">;

export class RecommendationsApi {
  constructor(
    private readonly request: RequestLike,
    private readonly page?: Page // <-- needed for multi-photo fallback
  ) {}

  /** Build a client that can do browser fetch fallback for multi-photo. */
  static fromPage(page: Page, requestLike: RequestLike) {
    return new RecommendationsApi(requestLike, page);
  }

  /* ---------------- internal helpers ---------------- */

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

  private normalizeJson(input: RecommendationInput) {
    return {
      name: String(input.name ?? "").trim(),
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      company: String(input.company ?? "").trim(),
      rating: input.rating ?? undefined,
      comment: String(input.comment ?? "").trim(),
      ...(input.source ? { source: String(input.source) } : {}),
    };
  }

  private toMultipartFields(input: RecommendationInput) {
    const fields: Record<string, any> = {
      name: input.name,
      email: input.email ?? "",
      phone: input.phone ?? "",
      company: input.company,
      rating: String(input.rating ?? 5),
      comment: input.comment,
    };
    if (input.source) fields.source = String(input.source);
    return fields;
  }

  /** In-browser fetch that supports multiple 'photos' parts. */
  private async createViaBrowserFetch(
    projectId: number,
    input: RecommendationInput
  ): Promise<number> {
    if (!this.page)
      throw new Error(
        "createViaBrowserFetch requires a Page; construct via RecommendationsApi.fromPage(page, requestLike)"
      );

    // Convert buffers to base64 to pass into the browser context
    const photos = (input.photos ?? []).map((p) => ({
      name: p.name,
      mimeType: p.mimeType,
      b64: p.buffer.toString("base64"),
    }));

    const url = `${API_PREFIX}/projects/${projectId}/recommendations`;
    const payload = {
      ...this.normalizeJson(input),
      // rating is normalized as number in JSON; for multipart we’ll send as text
      rating: input.rating == null ? undefined : Number(input.rating as number),
      photos,
    };

    const result = await this.page.evaluate(
      async (args) => {
        // Read idToken from localStorage (same logic you already use)
        function getIdTokenFromLocalStorage(): string {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith("firebase:authUser:")) continue;
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try {
              const obj = JSON.parse(raw as string);
              const t = obj?.stsTokenManager?.accessToken;
              if (t && typeof t === "string") return t as string;
            } catch {}
          }
          return "";
        }

        const token = getIdTokenFromLocalStorage();
        if (!token) throw new Error("idToken not found in localStorage");

        // Build FormData with repeated 'photos' keys
        const fd = new FormData();
        fd.set("name", args.data.name || "");
        if (args.data.email) fd.set("email", args.data.email);
        if (args.data.phone) fd.set("phone", args.data.phone);
        fd.set("company", args.data.company || "");
        if (typeof args.data.rating === "number")
          fd.set("rating", String(args.data.rating));
        fd.set("comment", args.data.comment || "");
        if (args.data.source) fd.set("source", String(args.data.source));

        for (const p of args.data.photos as Array<{
          name: string;
          mimeType: string;
          b64: string;
        }>) {
          // convert base64 -> Uint8Array -> Blob/File
          const bin = atob(p.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const file = new File([bytes], p.name, { type: p.mimeType });
          fd.append("photos", file, p.name);
        }

        const res = await fetch(args.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });

        const text = await res.text();
        return { status: res.status, text };
      },
      { url, data: payload }
    );

    expect(
      result.status >= 200 && result.status < 300,
      `Failed to create recommendation (browser fetch, multi-photo): HTTP ${result.status} ${result.text}`
    ).toBeTruthy();

    let body: any = {};
    try {
      body = result.text ? JSON.parse(result.text) : {};
    } catch {
      throw new Error(
        `Expected JSON from recommendations endpoint (browser fetch). Got: HTTP ${result.status} ${result.text}`
      );
    }

    const id =
      body?.recommendationId ?? body?.recommendation?.id ?? body?.id ?? null;
    expect(
      typeof id === "number",
      `Failed to parse created recommendation id (browser fetch): ${result.text}`
    ).toBeTruthy();
    return id as number;
  }

  /* ---------------- public API ---------------- */

  /**
   * Create a recommendation for a project.
   * - 0 photos  -> JSON (page.request)
   * - 1 photo   -> multipart single file (page.request)
   * - 2+ photos -> **browser fetch** with FormData supporting repeated "photos" keys
   */
  async create(
    projectId: number,
    input: RecommendationInput,
    opts?: { headers?: Record<string, string> }
  ): Promise<number> {
    const url = `${API_PREFIX}/projects/${projectId}/recommendations`;
    const photos = Array.isArray(input.photos) ? input.photos : [];

    // 2+ photos -> fallback to browser fetch
    if (photos.length > 1) {
      return this.createViaBrowserFetch(projectId, input);
    }

    // 1 photo -> multipart via page.request
    if (photos.length === 1) {
      const first = photos[0]!;
      const multipart: Record<string, any> = this.toMultipartFields(input);
      multipart.photos = {
        name: first.name,
        mimeType: first.mimeType,
        buffer: first.buffer,
      };

      const res = await this.request.post(url, {
        multipart: multipart as any,
        headers: { ...(opts?.headers || {}) },
      });

      expect(
        res.ok(),
        `Failed to create recommendation (multipart): ${await res.text()}`
      ).toBeTruthy();

      return this.extractId(res);
    }

    // 0 photo -> JSON
    const res = await this.request.post(url, {
      data: this.normalizeJson(input),
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers || {}),
      },
    });

    expect(
      res.ok(),
      `Failed to create recommendation: ${await res.text()}`
    ).toBeTruthy();

    return this.extractId(res);
  }

  /** Magic link variant: same fallback logic for multi-photo. */
  async createMagic(
    token: string,
    input: RecommendationInput,
    opts?: { headers?: Record<string, string> }
  ): Promise<number> {
    const url = `${API_PREFIX}/recommendations/magic/${encodeURIComponent(
      token
    )}`;
    const photos = Array.isArray(input.photos) ? input.photos : [];

    if (photos.length > 1) {
      // Reuse the browser path with a different URL
      if (!this.page)
        throw new Error("createMagic with multiple photos requires a Page");
      const photosB64 = photos.map((p) => ({
        name: p.name,
        mimeType: p.mimeType,
        b64: p.buffer.toString("base64"),
      }));

      const payload = {
        ...this.normalizeJson(input),
        photos: photosB64,
        hireAgain: input.hireAgain ?? undefined,
      };

      const result = await this.page.evaluate(
        async (args) => {
          function getIdTokenFromLocalStorage(): string {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (!k || !k.startsWith("firebase:authUser:")) continue;
              const raw = localStorage.getItem(k);
              if (!raw) continue;
              try {
                const obj = JSON.parse(raw as string);
                const t = obj?.stsTokenManager?.accessToken;
                if (t && typeof t === "string") return t as string;
              } catch {}
            }
            return "";
          }
          const token = getIdTokenFromLocalStorage(); // optional; magic endpoint allows anon

          const fd = new FormData();
          fd.set("name", args.data.name || "");
          if (args.data.email) fd.set("email", args.data.email);
          if (args.data.phone) fd.set("phone", args.data.phone);
          fd.set("company", args.data.company || "");
          if (typeof args.data.rating === "number")
            fd.set("rating", String(args.data.rating));
          fd.set("comment", args.data.comment || "");
          if (args.data.source) fd.set("source", String(args.data.source));
          if (args.data.hireAgain != null)
            fd.set("hireAgain", String(args.data.hireAgain));

          for (const p of args.data.photos as Array<{
            name: string;
            mimeType: string;
            b64: string;
          }>) {
            const bin = atob(p.b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const file = new File([bytes], p.name, { type: p.mimeType });
            fd.append("photos", file, p.name);
          }

          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;

          const res = await fetch(args.url, {
            method: "POST",
            headers,
            body: fd,
          });
          const text = await res.text();
          return { status: res.status, text };
        },
        { url, data: payload }
      );

      expect(
        result.status >= 200 && result.status < 300,
        `Failed to create recommendation via magic (browser fetch): HTTP ${result.status} ${result.text}`
      ).toBeTruthy();

      const body = result.text ? JSON.parse(result.text) : {};
      const id =
        body?.recommendationId ?? body?.recommendation?.id ?? body?.id ?? null;
      expect(
        typeof id === "number",
        `Failed to parse created recommendation id (magic, browser fetch): ${result.text}`
      ).toBeTruthy();
      return id as number;
    }

    // <=1 photo -> old paths
    if (photos.length === 1) {
      const first = photos[0]!;
      const fields: Record<string, any> = this.toMultipartFields(input);
      if (input.hireAgain !== undefined && input.hireAgain !== null) {
        fields.hireAgain = String(input.hireAgain);
      }
      fields.photos = {
        name: first.name,
        mimeType: first.mimeType,
        buffer: first.buffer,
      };

      const res = await this.request.post(url, {
        multipart: fields as any,
        headers: { ...(opts?.headers || {}) },
      });

      expect(
        res.ok(),
        `Failed to create recommendation via magic (multipart): ${await res.text()}`
      ).toBeTruthy();

      return this.extractId(res);
    }

    // JSON
    const json: Record<string, any> = this.normalizeJson(input);
    if (input.hireAgain !== undefined && input.hireAgain !== null) {
      json.hireAgain = input.hireAgain;
    }

    const res = await this.request.post(url, {
      data: json,
      headers: {
        "Content-Type": "application/json",
        ...(opts?.headers || {}),
      },
    });

    expect(
      res.ok(),
      `Failed to create recommendation via magic: ${await res.text()}`
    ).toBeTruthy();

    return this.extractId(res);
  }

  async like(
    recommendationId: number,
    opts?: { headers?: Record<string, string> }
  ) {
    const res = await this.request.post(
      `${API_PREFIX}/recommendations/${recommendationId}/like`,
      { headers: { ...(opts?.headers || {}) } }
    );
    expect(
      res.ok(),
      `Failed to like recommendation ${recommendationId}: ${await res.text()}`
    ).toBeTruthy();
  }

  async likeMany(ids: number[], opts?: { headers?: Record<string, string> }) {
    for (const id of ids) await this.like(id, opts);
  }

  async createMany(
    projectId: number,
    items: RecommendationInput[],
    opts?: { headers?: Record<string, string> }
  ): Promise<number[]> {
    const out: number[] = [];
    for (const it of items) out.push(await this.create(projectId, it, opts));
    return out;
  }
}

export default RecommendationsApi;
