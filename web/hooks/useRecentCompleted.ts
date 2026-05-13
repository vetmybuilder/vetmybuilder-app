// web/hooks/useRecentCompleted.ts
//
// Tiny client hook that wraps GET /api/tradesmen/:uid/recent-completed.
// Used by both faces of the swipe-deck card:
//   - BuilderCard       → "Top tradesperson" chip when topTradesperson=true
//   - BuilderCardBack   → emerald "Recently completed in {area}" band +
//                          lightbox of the closure photos
//
// No shared cache — each card mount does its own fetch. That's two
// fetches per card (front + back) but the response is tiny and the
// deck only renders one card at a time visibly, so it's not worth a
// caching layer yet.
import { useEffect, useState } from "react";
import { useApi } from "@/utils/api";

export type RecentCompletedItem = {
  projectType: string | null;
  area: string | null;
  closedAt: string | null;
  photos: string[];
};

export type RecentCompletedState = {
  loading: boolean;
  topTradesperson: boolean;
  items: RecentCompletedItem[];
};

const EMPTY: RecentCompletedState = {
  loading: false,
  topTradesperson: false,
  items: [],
};

export function useRecentCompleted(uid: string | null | undefined) {
  const api = useApi();
  const [state, setState] = useState<RecentCompletedState>(EMPTY);

  useEffect(() => {
    if (!uid) {
      setState(EMPTY);
      return;
    }
    let alive = true;
    setState({ loading: true, topTradesperson: false, items: [] });
    (async () => {
      try {
        const { data } = await api.get<{
          items: RecentCompletedItem[];
          topTradesperson: boolean;
        }>(`/api/tradesmen/${encodeURIComponent(uid)}/recent-completed`);
        if (!alive) return;
        setState({
          loading: false,
          topTradesperson: !!data?.topTradesperson,
          items: Array.isArray(data?.items) ? data.items : [],
        });
      } catch {
        if (alive) setState(EMPTY);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, uid]);

  return state;
}
