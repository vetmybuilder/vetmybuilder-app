import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

type AccountExpectation = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

type MultipartPayload =
  | Record<string, any>
  | { fields: Record<string, any>; photos?: string[] };

type ResponseLike = {
  status(): number;
  ok(): boolean;
  json(): Promise<any>;
  text(): Promise<string>;
};

type BrowserMultipartArgs = {
  url: string;
  fields: Record<string, string>;
  photos: Array<{ name: string; mimeType: string; b64: string }>;
  authHeader: string;
};

export function api(
  request: APIRequestContext,
  baseUrl: string,
  bearerToken?: string,
  page?: Page
) {
  const headers: Record<string, string> = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const testSecret = process.env.E2E_TEST_SECRET;
  if (testSecret) headers["X-Test-Secret"] = testSecret;

  const E2E_ROOT = path.resolve(__dirname, "../..");

  function resolveFilePath(p: string) {
    if (!p) return p;
    if (path.isAbsolute(p)) return p;
    return path.resolve(E2E_ROOT, p);
  }

  async function getJson(urlPath: string) {
    const res = await request.get(baseUrl + urlPath, { headers });
    const json = await res.json().catch(() => null);
    return { res, json };
  }

  async function waitForAccount(expected: AccountExpectation) {
    await expect
      .poll(async () => {
        const { res, json } = await getJson("/api/account");
        if (res.status() !== 200) return false;

        const user = json?.user;
        if (!user) return false;

        if (
          expected.firstName !== undefined &&
          user.firstName !== expected.firstName
        )
          return false;

        if (
          expected.lastName !== undefined &&
          user.lastName !== expected.lastName
        )
          return false;

        if (
          expected.username !== undefined &&
          user.username !== expected.username
        )
          return false;

        return true;
      })
      .toBe(true);

    const { json } = await getJson("/api/account");
    return json?.user ?? null;
  }

  function cleanFields(fields: Record<string, any>) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
    return out;
  }

  function guessMimeType(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    if (ext === ".txt") return "text/plain";

    return "application/octet-stream";
  }

  function readPhotos(photoPaths: string[]) {
    return photoPaths.map((pRaw) => {
      const p = resolveFilePath(pRaw);
      return {
        name: path.basename(p),
        mimeType: guessMimeType(p),
        b64: fs.readFileSync(p).toString("base64"),
      };
    });
  }

  async function postMultipartViaBrowser(
    urlPath: string,
    payload: { fields: Record<string, any>; photos?: string[] }
  ): Promise<ResponseLike> {
    if (!page) {
      throw new Error(
        "postMultipart requires Playwright 'page' when uploading multiple photos"
      );
    }

    const url = baseUrl + urlPath;
    const fields = cleanFields(payload.fields);
    const photos = payload.photos?.length ? readPhotos(payload.photos) : [];

    const result = await page.evaluate(
      async (args: BrowserMultipartArgs) => {
        const fd = new FormData();

        for (const [k, v] of Object.entries(args.fields)) {
          fd.set(k, v);
        }

        for (const p of args.photos) {
          const bin = atob(p.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

          const file = new File([bytes], p.name, { type: p.mimeType });
          fd.append("photos", file, p.name);
        }

        const res = await fetch(args.url, {
          method: "POST",
          headers: args.authHeader ? { Authorization: args.authHeader } : {},
          body: fd,
        });

        const text = await res.text();
        return { status: res.status, text };
      },
      {
        url,
        fields,
        photos,
        authHeader: headers.Authorization || "",
      }
    );

    return {
      status: () => result.status,
      ok: () => result.status >= 200 && result.status < 300,
      text: async () => result.text,
      json: async () => {
        try {
          return result.text ? JSON.parse(result.text) : null;
        } catch {
          return null;
        }
      },
    };
  }

  async function postMultipartViaNodeFetch(
    urlPath: string,
    payload: { fields: Record<string, any>; photos?: string[] }
  ): Promise<ResponseLike> {
    const url = baseUrl + urlPath;
    const fields = cleanFields(payload.fields);
    const photoPaths = Array.isArray(payload.photos) ? payload.photos : [];

    const fd = new FormData();

    for (const [k, v] of Object.entries(fields)) {
      fd.set(k, v);
    }

    for (const pRaw of photoPaths) {
      const p = resolveFilePath(pRaw);
      const buf = fs.readFileSync(p);
      const mimeType = guessMimeType(p);
      const filename = path.basename(p);
      const blob = new Blob([buf], { type: mimeType });
      fd.append("photos", blob, filename);
    }

    const h: Record<string, string> = {};
    if (headers.Authorization) h.Authorization = headers.Authorization;
    if (headers["X-Test-Secret"]) h["X-Test-Secret"] = headers["X-Test-Secret"];

    const res = await fetch(url, { method: "POST", headers: h, body: fd });
    const text = await res.text();

    return {
      status: () => res.status,
      ok: () => res.status >= 200 && res.status < 300,
      text: async () => text,
      json: async () => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      },
    };
  }

  async function postMultipart(
    urlPath: string,
    data: MultipartPayload
  ): Promise<ResponseLike> {
    if ((data as any)?.fields) {
      const { fields, photos } = data as {
        fields: Record<string, any>;
        photos?: string[];
      };

      const photoPaths = Array.isArray(photos) ? photos : [];

      if (photoPaths.length > 1) {
        return postMultipartViaNodeFetch(urlPath, {
          fields,
          photos: photoPaths,
        });
      }

      const multipart: Record<string, any> = cleanFields(fields);

      if (photoPaths.length === 1) {
        const filePath = resolveFilePath(photoPaths[0]!);
        multipart.photos = {
          name: path.basename(filePath),
          mimeType: guessMimeType(filePath),
          buffer: fs.readFileSync(filePath),
        };
      }

      const res = await request.post(baseUrl + urlPath, { headers, multipart });
      return res as unknown as ResponseLike;
    }

    const res = await request.post(baseUrl + urlPath, {
      headers,
      multipart: data as Record<string, any>,
    });

    return res as unknown as ResponseLike;
  }

  async function getProjectRecommendation(projectId: number, recId: number) {
    const res = await request.get(
      `${baseUrl}/api/projects/${projectId}/recommendations`,
      { headers }
    );

    expect(res.ok()).toBe(true);

    const body = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const item = items.find((r: any) => r && r.id === recId);

    return item || null;
  }

  async function uploadProjectClosePhotos(
    projectId: number,
    photoPaths: string[]
  ) {
    const payload = { fields: {}, photos: photoPaths };
    return postMultipart(`/api/projects/${projectId}/close/photos`, payload);
  }

  async function uploadProjectClosePhotosUnauthed(
    projectId: number,
    photoPaths: string[]
  ) {
    const multipart: Record<string, any> = {};

    if (photoPaths.length > 0) {
      const p = resolveFilePath(photoPaths[0]!);
      multipart.photos = {
        name: path.basename(p),
        mimeType: "image/jpeg",
        buffer: fs.readFileSync(p),
      };
    }

    return request.post(`${baseUrl}/api/projects/${projectId}/close/photos`, {
      multipart,
    });
  }

  async function createProjectMagicLink(projectId: number) {
    return request.post(`${baseUrl}/api/projects/${projectId}/magic-link`, {
      headers,
    });
  }

  async function rotateProjectMagicLink(projectId: number) {
    return request.post(
      `${baseUrl}/api/projects/${projectId}/magic-link?rotate=1`,
      { headers }
    );
  }

  async function postMagicRecommendation(token: string, payload: any) {
    return request.post(`${baseUrl}/api/recommendations/magic/${token}`, {
      data: payload,
      headers,
    });
  }

  async function getTradesmanMe() {
    return request.get(`${baseUrl}/api/tradesmen/me`, { headers });
  }

  async function getTradesmanMeUnauthed() {
    return request.get(`${baseUrl}/api/tradesmen/me`);
  }

  return {
    get: (urlPath: string) => request.get(baseUrl + urlPath, { headers }),
    post: (urlPath: string, data?: any) =>
      request.post(baseUrl + urlPath, { data, headers }),
    put: (urlPath: string, data?: any) =>
      request.put(baseUrl + urlPath, { data, headers }),
    del: (urlPath: string) => request.delete(baseUrl + urlPath, { headers }),

    getJson,
    waitForAccount,
    postMultipart,
    getProjectRecommendation,
    uploadProjectClosePhotos,
    uploadProjectClosePhotosUnauthed,
    createProjectMagicLink,
    rotateProjectMagicLink,
    postMagicRecommendation,
    getTradesmanMe,
    getTradesmanMeUnauthed,

    // kept for compatibility if you still call it anywhere
    postMultipartViaBrowser,
  };
}

export async function authedApiForUid(
  request: APIRequestContext,
  baseUrl: string,
  uid: string,
  page?: Page
) {
  if (baseUrl.includes(":3000")) {
    throw new Error(
      `INVALID baseUrl passed to authedApiForUid: ${baseUrl} Use Playwright project baseURL (3100+) instead`
    );
  }

  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("Missing E2E_TEST_SECRET");

  const res = await request.post(`${baseUrl}/api/__test__/auth/id-token`, {
    headers: { "X-Test-Secret": secret },
    data: { uid },
  });

  if (!res.ok()) throw new Error(`Failed to mint token: ${res.status()}`);

  const { idToken } = await res.json();
  return api(request, baseUrl, idToken, page);
}
