import { useMemo, useRef } from "react";
import type { AxiosInstance } from "axios";
import { suggestProjectTypes } from "@/types/projectTypes";

type Cache = Map<string, string[]>;

function norm(q: string) {
  return q.trim().toLowerCase();
}

export function useProjectTypeSuggester(api: AxiosInstance, limit = 8) {
  const cacheRef = useRef<Cache>(new Map());
  const inflightRef = useRef<Record<string, number>>({}); // debounce timers

  // default quick picks (same as client fallback)
  const defaults = useMemo(() => suggestProjectTypes("", limit), [limit]);

  function scheduleFetch(q: string) {
    const key = norm(q);
    // debounce ~150ms per key
    if (inflightRef.current[key]) clearTimeout(inflightRef.current[key]);
    inflightRef.current[key] = window.setTimeout(async () => {
      try {
        const { data } = await api.get("/api/project-types", {
          params: { s: q, limit },
        });
        const items: string[] = Array.isArray(data?.items) ? data.items : [];
        cacheRef.current.set(
          key,
          items.length ? items : suggestProjectTypes(q, limit)
        );
      } catch {
        cacheRef.current.set(key, suggestProjectTypes(q, limit));
      } finally {
        delete inflightRef.current[key];
      }
    }, 150);
  }

  /**
   * Synchronous getter used by the combobox.
   * Returns cached suggestions immediately; triggers a debounced fetch in the background.
   */
  function get(query: string): string[] {
    const key = norm(query);
    if (!key) return defaults;
    if (!cacheRef.current.has(key)) {
      // prime cache with local fallback immediately (snappy UX)
      cacheRef.current.set(key, suggestProjectTypes(query, limit));
      // then fetch from the API to refine results
      scheduleFetch(query);
    }
    return cacheRef.current.get(key)!;
  }

  return { get, defaults };
}

export default useProjectTypeSuggester;
