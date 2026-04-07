import type { APIRequestContext, Page } from "@playwright/test";
import { createApiCore } from "../_core";
import { projectsClient } from "../services/projects.client";
import { recommendationsClient } from "../services/recommendations.client";
import { tradesmenClient } from "../services/tradesmen.client";

function normalizeBaseUrl(url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function isDockerRun(): boolean {
  return (
    process.env.DOCKER === "1" ||
    String(process.env.IN_DOCKER || "").toLowerCase() === "true"
  );
}

function normalizeLocalhostForHostRuns(url: string): string {
  return url.replace("http://localhost", "http://127.0.0.1");
}

/**
 * Rules:
 * - In Docker: use API_BASE_URL if set (e.g. http://server-w0:3100)
 * - On host: use passedBaseUrl (and normalize localhost->127.0.0.1)
 * - Do NOT use NEXT_PUBLIC_API_BASE here (that's for the web app)
 */
function resolveApiBaseUrl(passedBaseUrl: string): string {
  const passed = normalizeBaseUrl(passedBaseUrl);
  const docker = isDockerRun();

  const envApiBase = normalizeBaseUrl(process.env.API_BASE_URL || "");
  const chosen = docker && envApiBase ? envApiBase : passed;

  return docker ? chosen : normalizeLocalhostForHostRuns(chosen);
}

export function api(
  request: APIRequestContext,
  baseUrl: string,
  bearerToken?: string,
  page?: Page,
) {
  const effectiveBaseUrl = resolveApiBaseUrl(baseUrl);
  const core = createApiCore({
    request,
    baseUrl: effectiveBaseUrl,
    bearerToken,
    page,
  });

  return {
    // core http + shared helpers
    get: core.get,
    post: core.post,
    put: core.put,
    patch: core.patch,
    del: core.del,
    getJson: core.getJson,
    waitForAccount: core.waitForAccount,
    postMultipart: core.postMultipart,
    postMultipartViaBrowser: core.postMultipartViaBrowser,

    // services
    ...projectsClient(core),
    ...recommendationsClient(core),
    ...tradesmenClient(core),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: { text(): Promise<string> }) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function isDisposedOrClosedError(err: unknown) {
  const msg = String((err as any)?.message || err || "");
  return (
    msg.includes("Request context disposed") ||
    msg.includes("Target page, context or browser has been closed") ||
    msg.includes("browser has been closed") ||
    msg.includes("context has been closed")
  );
}

function isRetryableNetworkError(err: unknown) {
  const msg = String((err as any)?.message || err || "");
  return (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("EAI_AGAIN") ||
    msg.includes("socket hang up") ||
    msg.includes("Timeout") ||
    msg.includes("timeout")
  );
}

export async function authedApiForUid(
  request: APIRequestContext,
  baseUrl: string,
  uid: string,
  page?: Page,
) {
  const effectiveBaseUrl = resolveApiBaseUrl(baseUrl);

  if (effectiveBaseUrl.includes(":3000")) {
    throw new Error(
      `INVALID baseUrl passed to authedApiForUid: ${effectiveBaseUrl} Use API base URL (3100+) instead`,
    );
  }

  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("Missing E2E_TEST_SECRET");

  // Parallel startup + firebase + server warmup can be slow.
  // Give ourselves a bigger overall window and per-request timeout.
  const deadline = Date.now() + 60_000;
  const perRequestTimeoutMs = 15_000;

  let lastStatus: number | null = null;
  let lastBody = "";
  let lastErr = "";

  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;

    try {
      const res = await request.post(
        `${effectiveBaseUrl}/api/__test__/auth/id-token`,
        {
          headers: { "X-Test-Secret": secret },
          data: { uid },
          timeout: perRequestTimeoutMs,
        },
      );

      if (res.ok()) {
        const { idToken } = await res.json();
        return api(request, effectiveBaseUrl, idToken, page);
      }

      lastStatus = res.status();
      lastBody = await safeText(res);

      // Retry on “server is warming up / overloaded” signals
      if (lastStatus >= 500 || lastStatus === 429 || lastStatus === 408) {
        await sleep(Math.min(2000, 250 + attempt * 200));
        continue;
      }

      throw new Error(
        `Failed to mint token: ${lastStatus}\n${lastBody || "(no body)"}`,
      );
    } catch (err) {
      if (isDisposedOrClosedError(err)) {
        throw new Error(
          [
            `Token mint aborted: request context was disposed/closed.`,
            `This usually means the test timed out or was interrupted while trying to mint an idToken.`,
            `uid=${uid}`,
            `baseUrl=${effectiveBaseUrl}`,
            `originalError=${String((err as any)?.message || err)}`,
          ].join("\n"),
        );
      }

      lastErr = String((err as any)?.message || err);

      if (isRetryableNetworkError(err)) {
        await sleep(Math.min(2000, 250 + attempt * 200));
        continue;
      }

      throw err;
    }
  }

  throw new Error(
    [
      `Failed to mint token after retries (60s).`,
      `uid=${uid}`,
      `baseUrl=${effectiveBaseUrl}`,
      `lastStatus=${lastStatus ?? "n/a"}`,
      lastBody ? `lastBody=${lastBody}` : "",
      lastErr ? `lastError=${lastErr}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export async function getUidFromJoinResponse(res: { json(): Promise<any> }) {
  const body: any = await res.json();

  const uid =
    body?.uid || body?.userId || body?.id || body?.data?.uid || body?.data?.id;

  if (!uid)
    throw new Error("Could not find uid in /api/tradesmen/join response");

  return String(uid);
}