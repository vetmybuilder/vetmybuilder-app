// web/components/VmbScorePill.tsx
import * as React from "react";
import { useApi } from "@/utils/api";
import { getAggregateVmbForCompany, type FetchRecsFn } from "@/utils/vmb";

type VmbScorePillProps = {
  projectId?: number | null;
  companyName?: string | null;
  /** Optional starting value while we recompute aggregate */
  fallbackScore?: number | null;
  className?: string;
  "data-testid"?: string;
};

export function VmbScorePill({
  projectId,
  companyName,
  fallbackScore,
  className = "",
  "data-testid": testId = "vmb-score",
}: VmbScorePillProps) {
  const api = useApi();

  const [score, setScore] = React.useState<number | undefined>(() => {
    return typeof fallbackScore === "number" ? fallbackScore : undefined;
  });

  // Recompute aggregate score from /api/recommendations/ratings
  React.useEffect(() => {
    if (!projectId || !companyName) return;

    let cancelled = false;

    const ratingsFetcher: FetchRecsFn = async ({
      projectId,
      offset = 0,
      limit = 250,
    }) => {
      const { data } = await api.get(
        `/api/recommendations/ratings?projectId=${projectId}&offset=${offset}&limit=${limit}`
      );
      const items =
        (data?.items || []).map((it: any) => ({
          id: it.id,
          company: it.company,
          score: it.score,
        })) ?? [];
      const total = Number.isFinite(data?.total) ? data.total : items.length;
      return { items, total };
    };

    (async () => {
      try {
        const agg = await getAggregateVmbForCompany(
          ratingsFetcher,
          projectId,
          companyName,
          typeof fallbackScore === "number" ? fallbackScore : undefined
        );
        if (!cancelled && typeof agg === "number") {
          setScore(agg);
        }
      } catch {
        // ignore, keep fallback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, projectId, companyName, fallbackScore]);

  if (score == null || Number.isNaN(Number(score))) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600 ${className}`}
        data-testid={testId}
      >
        VMB —
      </span>
    );
  }

  const n = Number(score);
  const label =
    n <= 5 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 ${className}`}
      title={`VMB score: ${label}`}
      aria-label={`VMB score ${label}`}
      data-testid={testId}
    >
      VMB {label}
    </span>
  );
}
