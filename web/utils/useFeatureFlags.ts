// web/utils/useFeatureFlags.ts
//
// Fetches the public feature-flag map from GET /api/feature-flags once and
// caches it module-wide (flags change rarely). Components read flags via
// useFeatureFlag("payments") etc. While loading, flags are treated as their
// safe default (false) so gated UI stays hidden until confirmed on.

import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";

type FlagMap = Record<string, boolean>;

let cache: FlagMap | null = null;
let inflight: Promise<FlagMap> | null = null;
const subscribers = new Set<(f: FlagMap) => void>();

function notify(flags: FlagMap) {
  subscribers.forEach((cb) => cb(flags));
}

export function useFeatureFlags(): { flags: FlagMap; loaded: boolean } {
  const api = useApi();
  const [flags, setFlags] = useState<FlagMap>(cache || {});
  const [loaded, setLoaded] = useState<boolean>(cache !== null);

  useEffect(() => {
    let alive = true;
    const onUpdate = (f: FlagMap) => {
      if (alive) {
        setFlags(f);
        setLoaded(true);
      }
    };
    subscribers.add(onUpdate);

    if (cache) {
      setFlags(cache);
      setLoaded(true);
    } else {
      if (!inflight) {
        inflight = api
          .get<{ flags: FlagMap }>("/api/feature-flags")
          .then(({ data }) => {
            cache = data?.flags || {};
            notify(cache);
            return cache;
          })
          .catch(() => {
            cache = {};
            notify(cache);
            return cache;
          })
          .finally(() => {
            inflight = null;
          });
      }
    }

    return () => {
      alive = false;
      subscribers.delete(onUpdate);
    };
  }, [api]);

  return { flags, loaded };
}

export function useFeatureFlag(key: string): boolean {
  const { flags } = useFeatureFlags();
  return !!flags[key];
}
