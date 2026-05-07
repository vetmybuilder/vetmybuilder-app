// Cold-start warm-up: before any test runs, ping each shard's /health and
// pre-compile the most-used Next.js pages (in dev mode every page compiles
// lazily on first request — that compile time would otherwise burn the
// per-test timeout on the first test that visits it). Runs entirely
// outside per-test timeouts.
import type { FullConfig } from "@playwright/test";
import { getRuntime } from "./config/runtime";

const ROUTES_TO_WARM = [
  "/",
  "/login",
  "/signup",
  "/logout",
  "/projects",
  "/projects/1/recommend",
  "/tradesman/login",
  "/tradesman/jobs",
  "/account",
];

async function warm(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404 || r.status === 401 || r.status === 302) {
        return;
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 500));
  }
}

export default async function globalSetup(_config: FullConfig) {
  const workers = Number(process.env.PW_WORKERS ?? 2);
  const runtimes = Array.from({ length: Math.max(workers, 1) }, (_, i) =>
    getRuntime(i),
  );

  // 1) Wait for every API shard to answer /health.
  await Promise.all(
    runtimes.map((r) =>
      warm(`${r.apiBaseUrl.replace(/\/+$/, "")}/health`, 60_000),
    ),
  );

  // 2) Pre-compile Next.js routes against the web base URL (worker 0's
  //    proxy or the root web server). One pass is enough — Next.js caches
  //    the compiled bundle for the rest of the run.
  const webBase = runtimes[0].webBaseUrl.replace(/\/+$/, "");
  await Promise.all(
    ROUTES_TO_WARM.map((path) => warm(`${webBase}${path}`, 60_000)),
  );
}
