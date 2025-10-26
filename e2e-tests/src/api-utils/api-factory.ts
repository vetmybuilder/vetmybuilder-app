import type { Page } from "@playwright/test";
import { ProjectsApi } from "./projects-api";
import { RecommendationsApi } from "./recommendations-api";

const API_PREFIX = process.env.E2E_API_PREFIX || "/api";

/** Read the Firebase ID token from the browser’s localStorage (current page session). */
async function getIdTokenFromPage(page: Page): Promise<string> {
  const tok = await page.evaluate(() => {
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
  });
  if (!tok) throw new Error("idToken not found in localStorage");
  return tok;
}

/** Minimal request-like wrapper bound to the page’s current idToken. */
export async function makeSessionRequest(page: Page) {
  const wrap =
    (method: "get" | "post" | "put" | "delete") =>
    async (url: string, opts: Record<string, any> = {}) => {
      const finalUrl = url.startsWith("/") ? url : `${API_PREFIX}${url}`;
      const idToken = await getIdTokenFromPage(page); // fresh each call
      return (page.request as any)[method](finalUrl, {
        ...opts,
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(opts.headers || {}),
        },
      });
    };

  return {
    get: wrap("get"),
    post: wrap("post"),
    put: wrap("put"),
    delete: wrap("delete"),
  };
}

export async function createProjectsApiForPage(
  page: Page
): Promise<ProjectsApi> {
  const req = await makeSessionRequest(page);
  return new ProjectsApi(req as any);
}

export async function createRecommendationsApiForPage(
  page: Page
): Promise<RecommendationsApi> {
  const req = await makeSessionRequest(page);
  // IMPORTANT: pass page so multi-photo can use browser fetch fallback
  return RecommendationsApi.fromPage(page, req as any);
}

/** Convenience: build both at once. */
export async function createApisForPage(page: Page) {
  const req = await makeSessionRequest(page);
  return {
    requestLike: req,
    projects: new ProjectsApi(req as any),
    recommendations: RecommendationsApi.fromPage(page, req as any),
  };
}
