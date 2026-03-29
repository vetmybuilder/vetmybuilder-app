// web/components/builder/useTradesmanRedirect.ts

import { useEffect, useState } from "react";
import { useRouter } from "next/router";

type Params = {
  api: any;
  user: any;
  authLoading: boolean;
};

export function useTradesmanRedirect({ api, user, authLoading }: Params) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!router.isReady || authLoading) return;

    if (!user) {
      setRedirecting(false);
      return;
    }

    let cancelled = false;
    setRedirecting(true);

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const tradesman = data?.tradesman ?? data ?? {};

        const looksLikeProfile =
          !!tradesman?.user_id ||
          !!tradesman?.company_name ||
          !!tradesman?.status;

        if (looksLikeProfile && !cancelled) {
          router.replace("/tradesman/projects");
          return;
        }
      } catch {
        // not a tradesman, continue on this page
      } finally {
        if (!cancelled) setRedirecting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, user, authLoading, router.isReady, router]);

  return {
    redirecting,
  };
}
