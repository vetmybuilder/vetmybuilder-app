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

  // Only needed for your /api/__test__ endpoints
  const testSecret = process.env.E2E_TEST_SECRET;
  if (testSecret) headers["X-Test-Secret"] = testSecret;

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
    return photoPaths.map((p) => ({
      name: path.basename(p),
      mimeType: guessMimeType(p),
      b64: fs.readFileSync(p).toString("base64"),
    }));
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

        // Route expects repeated field name: "photos"
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

  async function postMultipart(
    urlPath: string,
    data: MultipartPayload
  ): Promise<ResponseLike> {
    // New shape: { fields, photos: string[] }
    if ((data as any)?.fields) {
      const { fields, photos } = data as {
        fields: Record<string, any>;
        photos?: string[];
      };

      const photoPaths = Array.isArray(photos) ? photos : [];

      // 2+ photos -> browser FormData
      if (photoPaths.length > 1) {
        return postMultipartViaBrowser(urlPath, { fields, photos: photoPaths });
      }

      // 0 or 1 photo -> APIRequestContext multipart
      const multipart: Record<string, any> = cleanFields(fields);

      if (photoPaths.length === 1) {
        const filePath = photoPaths[0]!;
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
    const res = await postMultipart(
      `/api/projects/${projectId}/close/photos`,
      payload
    );
    return res;
  }

  async function uploadProjectClosePhotosUnauthed(
    projectId: number,
    photoPaths: string[]
  ) {
    const multipart: Record<string, any> = {};

    if (photoPaths.length > 0) {
      const filePath = photoPaths[0];
      multipart.photos = {
        name: path.basename(filePath),
        mimeType: "image/jpeg",
        buffer: fs.readFileSync(filePath),
      };
    }

    return request.post(`${baseUrl}/api/projects/${projectId}/close/photos`, {
      multipart,
    });
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
  };
}

export async function authedApiForUid(
  request: APIRequestContext,
  baseUrl: string,
  uid: string,
  page?: Page
) {
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
