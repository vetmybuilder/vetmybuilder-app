import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

export type AccountExpectation = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

export type MultipartPayload =
  | Record<string, any>
  | { fields: Record<string, any>; photos?: string[] };

export type ResponseLike = {
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

export type ApiCore = {
  request: APIRequestContext;
  baseUrl: string;
  headers: Record<string, string>;
  page?: Page;

  get: (urlPath: string) => Promise<any>;
  post: (urlPath: string, data?: any) => Promise<any>;
  put: (urlPath: string, data?: any) => Promise<any>;
  del: (urlPath: string) => Promise<any>;

  getJson: (urlPath: string) => Promise<{ res: any; json: any }>;
  waitForAccount: (expected: AccountExpectation) => Promise<any>;

  postMultipart: (
    urlPath: string,
    data: MultipartPayload,
  ) => Promise<ResponseLike>;

  // kept for compatibility if anything still calls it
  postMultipartViaBrowser: (
    urlPath: string,
    payload: { fields: Record<string, any>; photos?: string[] },
  ) => Promise<ResponseLike>;
};

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

export function safeTrim(v: any) {
  return String(v ?? "").trim();
}

export function encodeIdForPath(idRaw: any) {
  // IMPORTANT:
  // - If you pass "" here, you'll end up with ".../tradesmen//favourite" which won't match the route => 404
  // - Specs that want to hit the route with "blank" should use the ViaUrlParam helpers that encode spaces ("%20")
  return encodeURIComponent(safeTrim(idRaw));
}

export function createApiCore(args: {
  request: APIRequestContext;
  baseUrl: string;
  bearerToken?: string;
  page?: Page;
}): ApiCore {
  const { request, baseUrl, bearerToken, page } = args;

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
    payload: { fields: Record<string, any>; photos?: string[] },
  ): Promise<ResponseLike> {
    if (!page) {
      throw new Error(
        "postMultipart requires Playwright 'page' when uploading multiple photos",
      );
    }

    const url = baseUrl + urlPath;
    const fields = cleanFields(payload.fields);
    const photos = payload.photos?.length ? readPhotos(payload.photos) : [];

    const result = await page.evaluate(
      async (p: BrowserMultipartArgs) => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(p.fields)) fd.set(k, v);

        for (const photo of p.photos) {
          const bin = atob(photo.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const file = new File([bytes], photo.name, { type: photo.mimeType });
          fd.append("photos", file, photo.name);
        }

        const res = await fetch(p.url, {
          method: "POST",
          headers: p.authHeader ? { Authorization: p.authHeader } : {},
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
      },
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
    payload: { fields: Record<string, any>; photos?: string[] },
  ): Promise<ResponseLike> {
    const url = baseUrl + urlPath;
    const fields = cleanFields(payload.fields);
    const photoPaths = Array.isArray(payload.photos) ? payload.photos : [];

    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);

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
    data: MultipartPayload,
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

  const http = {
    get: (urlPath: string) => request.get(baseUrl + urlPath, { headers }),
    post: (urlPath: string, data?: any) =>
      request.post(baseUrl + urlPath, { data, headers }),
    put: (urlPath: string, data?: any) =>
      request.put(baseUrl + urlPath, { data, headers }),
    del: (urlPath: string) => request.delete(baseUrl + urlPath, { headers }),
  };

  return {
    request,
    baseUrl,
    headers,
    page,

    ...http,
    getJson,
    waitForAccount,

    postMultipart,
    postMultipartViaBrowser,
  };
}
