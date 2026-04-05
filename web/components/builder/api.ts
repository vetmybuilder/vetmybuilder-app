// web/components/builder/api.ts

import type { Builder } from "@/types/builderTypes";

export async function fetchProjectRecommendations(
  api: any,
  projectId: number,
): Promise<any[]> {
  const tryRoutes = [
    `/api/projects/${projectId}/recommendations?limit=50`,
    `/api/projects/${projectId}`,
  ];

  for (const path of tryRoutes) {
    try {
      const { data } = await api.get(path);

      if (Array.isArray(data?.recommendations)) return data.recommendations;
      if (Array.isArray(data?.project?.recommendations))
        return data.project.recommendations;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.project?.items)) return data.project.items;
    } catch {
      // ignore
    }
  }

  try {
    const { data } = await api.get(
      `/api/recommendations/ratings?projectId=${projectId}&limit=200&offset=0`,
    );

    const ids: number[] = Array.isArray(data?.items)
      ? data.items.map((x: any) => Number(x?.id)).filter(Number.isFinite)
      : [];

    if (!ids.length) return [];

    const hydrate = async (id: number) => {
      try {
        const { data } = await api.get(`/api/recommendations/${id}`);
        return data?.recommendation || null;
      } catch {
        return null;
      }
    };

    const results: any[] = [];
    const concurrency = 6;

    for (let i = 0; i < ids.length; i += concurrency) {
      const chunk = ids.slice(i, i + concurrency);
      const got = await Promise.all(chunk.map(hydrate));
      results.push(...got.filter(Boolean));
    }

    return results;
  } catch {
    return [];
  }
}

// --- Auth retry helpers (moved out of page) ---

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeAuthRace(err: any) {
  const status = err?.response?.status ?? err?.status;
  const msg =
    err?.response?.data?.error ?? err?.data?.error ?? err?.message ?? "";

  return status === 401 || /missing bearer token/i.test(String(msg));
}

export async function getWithAuthRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 250,
): Promise<T> {
  let lastErr: any;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;

      if (!looksLikeAuthRace(e) || i === attempts) break;

      await sleep(baseDelayMs * i);
    }
  }

  throw lastErr;
}
