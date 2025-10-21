import { useEffect, useState } from "react";
import type { AxiosInstance } from "axios";

type ItemWithWinner = { _winnerRecommendationId?: number | null };

/**
 * Resolves recommendation IDs to display labels (company or name).
 * - enabled: run only when the Completed tab is active
 * - items: array from the projects list API (must include _winnerRecommendationId)
 * - api: your axios instance from useApi()
 */
export function useTradesmanLabels(
  enabled: boolean,
  items: ItemWithWinner[],
  api: AxiosInstance
) {
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLabels({});
      return;
    }

    const ids = Array.from(
      new Set(
        (items || [])
          .map((p) => p._winnerRecommendationId)
          .filter(
            (x): x is number => typeof x === "number" && Number.isFinite(x)
          )
      )
    );

    if (ids.length === 0) {
      setLabels({});
      return;
    }

    let alive = true;
    setLoading(true);

    (async () => {
      const out: Record<number, string> = {};
      await Promise.all(
        ids.map(async (rid) => {
          try {
            const { data } = await api.get(`/api/recommendations/${rid}`);
            const rec = data?.recommendation;
            out[rid] = rec?.company || rec?.name || `#${rid}`;
          } catch {
            out[rid] = `#${rid}`;
          }
        })
      );
      if (alive) setLabels(out);
      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [enabled, api, JSON.stringify(items)]);

  return { labels, loading };
}
