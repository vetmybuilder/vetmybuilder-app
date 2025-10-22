// web/utils/vmb.ts

/** Tiny record used across pages when we only need id/company/score */
export type RecLite = {
  id: number;
  company: string;
  score?: number | null;
};

/** Generic fetcher signature so this stays UI-agnostic */
export type FetchRecsFn = (args: {
  projectId: number;
  offset?: number;
  limit?: number;
}) => Promise<{ items: RecLite[]; total: number }>;

/* -----------------------------
 * Normalization (shared)
 * --------------------------- */

/** Normalize company names so different casings/punctuations group together */
export function normalizedCompanyKey(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/* -----------------------------
 * Aggregation (shared)
 * --------------------------- */

/**
 * Aggregate VMB score:
 *  - average of available scores
 *  - +0.2 “crowd bonus” per extra recommendation (cap +1)
 *  - clamped to 0..5
 */
export function computeAggregateScore(
  scores: Array<number | null | undefined>,
  count: number
) {
  const numeric = scores
    .map(Number)
    .filter((n) => Number.isFinite(n)) as number[];
  const avg = numeric.length
    ? numeric.reduce((a, b) => a + b, 0) / numeric.length
    : 0;
  const crowdBonus = Math.min(1, Math.max(0, count - 1) * 0.2);
  const agg = Math.max(0, Math.min(5, avg + crowdBonus));
  return agg;
}

/**
 * Pull every recommendation for a project (paged) using a caller-supplied fetcher.
 * Use this when the page hasn’t already loaded the full list.
 */
export async function fetchAllProjectRecs(
  fetchRecs: FetchRecsFn,
  projectId: number
) {
  const pageSize = 250;
  let offset = 0;
  let items: RecLite[] = [];

  const first = await fetchRecs({ projectId, offset, limit: pageSize });
  items = first.items || [];
  const total = first.total ?? items.length;

  while (items.length < total) {
    offset += pageSize;
    const next = await fetchRecs({ projectId, offset, limit: pageSize });
    if (!next.items || next.items.length === 0) break;
    items = items.concat(next.items);
  }
  return { items, total };
}

/**
 * The single source of truth for which score to show for a builder inside a project.
 * Rule:
 *  - If there are 2+ recs for the same company → show the aggregate score.
 *  - Else → show the single recommendation’s score you already have.
 */
export async function getAggregateVmbForCompany(
  fetchRecs: FetchRecsFn,
  projectId: number,
  companyName: string,
  singleRecScore?: number | null
): Promise<number | undefined> {
  const key = normalizedCompanyKey(companyName);
  const { items } = await fetchAllProjectRecs(fetchRecs, projectId);
  const sameCompany = items.filter(
    (it) => normalizedCompanyKey(it.company || "") === key
  );

  if (sameCompany.length >= 2) {
    return computeAggregateScore(
      sameCompany.map((i) => i.score),
      sameCompany.length
    );
  }
  return typeof singleRecScore === "number" ? singleRecScore : undefined;
}

/**
 * Lightweight variant when the page already has a list of recs loaded.
 * Avoids extra API calls.
 */
export function pickAggregateFromLoaded(
  loadedItems: RecLite[] | undefined,
  companyName: string,
  singleRecScore?: number | null
): number | undefined {
  if (!loadedItems || loadedItems.length === 0) {
    return typeof singleRecScore === "number" ? singleRecScore : undefined;
  }
  const key = normalizedCompanyKey(companyName);
  const sameCompany = loadedItems.filter(
    (it) => normalizedCompanyKey(it.company || "") === key
  );

  if (sameCompany.length >= 2) {
    return computeAggregateScore(
      sameCompany.map((i) => i.score),
      sameCompany.length
    );
  }
  return typeof singleRecScore === "number" ? singleRecScore : undefined;
}

/* -----------------------------
 * Shared grouping for UI lists
 * --------------------------- */

/** Minimal shape a recommendation-like item needs for grouping/sorting */
export type RecommendationLike = {
  id: number;
  company: string;
  score?: number | null;
  likes?: number | null;
  createdAt: string; // ISO string
  // allow extra properties without narrowing
  [key: string]: any;
};

export type CompanyGroup<T extends RecommendationLike> = {
  key: string; // normalized company key
  company: string; // display company (from the group's picked top item)
  items: T[]; // all items for this company
  top: T; // the lead card (best score, then likes, then newest)
  extraCount: number;
  aggScore: number; // aggregate score with crowd bonus
  totalLikes: number;
};

/** Internal: choose a top item by highest score, then most likes, then newest */
function pickTop<T extends RecommendationLike>(arr: T[]): T {
  return [...arr].sort((a, b) => {
    const sa = Number.isFinite(Number(a.score)) ? Number(a.score) : -1;
    const sb = Number.isFinite(Number(b.score)) ? Number(b.score) : -1;
    if (sb !== sa) return sb - sa;
    const la = Number(a.likes ?? 0);
    const lb = Number(b.likes ?? 0);
    if (lb !== la) return lb - la;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  })[0];
}

/**
 * Group recommendations by normalized company and compute:
 *  - aggScore (average + crowd bonus)
 *  - totalLikes
 *  - top (lead) card selection
 * Sorted by aggScore desc, then totalLikes desc, then newest top.
 */
export function groupRecommendationsByCompany<T extends RecommendationLike>(
  items: T[]
): Array<CompanyGroup<T>> {
  const map = new Map<string, T[]>();
  for (const it of items || []) {
    const key = normalizedCompanyKey(it.company || "");
    const bucket = map.get(key);
    if (bucket) bucket.push(it);
    else map.set(key, [it]);
  }

  const groups: Array<CompanyGroup<T>> = Array.from(map.entries()).map(
    ([key, arr]) => {
      const top = pickTop(arr);
      const aggScore = computeAggregateScore(
        arr.map((i) => i.score),
        arr.length
      );
      const totalLikes = arr.reduce(
        (sum, it) => sum + Number(it.likes ?? 0),
        0
      );
      return {
        key,
        company: top.company,
        items: arr,
        top,
        extraCount: Math.max(0, arr.length - 1),
        aggScore,
        totalLikes,
      };
    }
  );

  groups.sort((g1, g2) => {
    if (g2.aggScore !== g1.aggScore) return g2.aggScore - g1.aggScore;
    if (g2.totalLikes !== g1.totalLikes) return g2.totalLikes - g1.totalLikes;
    return +new Date(g2.top.createdAt) - +new Date(g1.top.createdAt);
  });

  return groups;
}

/* -----------------------------
 * Optional UI helpers
 * --------------------------- */

/** “VMB 4.2” label formatter (drops .0) */
export function formatVmbLabel(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "VMB —";
  const n = Number(value);
  const label =
    n <= 5 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return `VMB ${label}`;
}

/* -----------------------------
 * Legacy exports (keep yours)
 * --------------------------- */

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
