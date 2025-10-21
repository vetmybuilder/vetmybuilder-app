// web/utils/vmb.ts
// One place to fetch VMB ratings + vote-up consistently

export type VmbItem = {
  id: number; // recommendationId
  company: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  comment: string | null;
  createdAt: string;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  hasPhotos?: 0 | 1;
  score: number; // authoritative VMB score from server
  votes?: number; // optional (if you return it later)
};

export type VmbListResponse = {
  items: VmbItem[];
  total: number;
  offset: number;
  limit: number;
};

export type VmbSingleResponse = {
  item: { recommendationId: number; score: number };
};

/**
 * Unified fetcher for ratings.
 * Pass either { projectId, offset?, limit? } or { recommendationId }.
 * The `api` param is your axios instance from useApi().
 */
export async function fetchVmbRatings(
  api: any,
  params:
    | { projectId: number; offset?: number; limit?: number }
    | { recommendationId: number }
): Promise<VmbListResponse | VmbSingleResponse> {
  const qs = new URLSearchParams();
  if ("projectId" in params) {
    qs.set("projectId", String(params.projectId));
    if (params.offset != null) qs.set("offset", String(params.offset));
    if (params.limit != null) qs.set("limit", String(params.limit));
  } else {
    qs.set("recommendationId", String(params.recommendationId));
  }
  const { data } = await api.get(
    `/api/v2/recommendations/ratings?${qs.toString()}`
  );
  return data;
}

/** Helper to show a consistent one-decimal chip everywhere */
export function formatVmb(score: number | null | undefined): string {
  const n = Number(score);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

/**
 * Vote-up a recommendation (same route as previous "like").
 * After calling this, refetch fetchVmbRatings(...) to refresh the score.
 */
export async function voteUpRecommendation(api: any, recommendationId: number) {
  await api.post(`/api/recommendations/${recommendationId}/like`);
}
