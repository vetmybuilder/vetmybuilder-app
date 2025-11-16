// web/components/tradesmen/FavouriteTradesmenSection.tsx
import * as React from "react";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import FeaturedSimpleCard from "@/components/tradesmen/FeaturedSimpleCard";

export type FavouriteTradesmanLite = {
  builderId: string;
  displayName: string;
  companyName?: string | null;
  avatarUrl?: string | null;
  score?: number | null;
};

export default function FavouriteTradesmenSection() {
  const api = useApi();
  const router = useRouter();

  const [items, setItems] = React.useState<FavouriteTradesmanLite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get("/api/tradesmen/favourites");
        const data = (res as any)?.data ?? res;
        const list: any[] = Array.isArray(data?.items) ? data.items : [];
        if (!cancelled) {
          setItems(
            list.map((t) => ({
              builderId: t.builderId,
              displayName: t.displayName || t.companyName || "Tradesman",
              companyName: t.companyName,
              avatarUrl: t.avatarUrl || null,
              score:
                typeof t.score === "number" && Number.isFinite(t.score)
                  ? t.score
                  : null,
            }))
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.response?.data?.error ||
              e?.message ||
              "Failed to load favourites"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <section
      aria-label="Favourite tradesmen"
      data-testid="favourites-tradesmen-section"
      className="mt-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight">
          Favourite builders
        </h2>
      </div>

      {loading && (
        <p className="text-sm text-slate-500" data-testid="favourites-loading">
          Loading favourites…
        </p>
      )}

      {error && !loading && (
        <p className="text-sm text-rose-600" data-testid="favourites-error">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-slate-500" data-testid="favourites-empty">
          You haven’t saved any builders yet. Tap the “Save to favourites”
          button on a builder profile to see them here.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t) => (
            <div
              key={t.builderId}
              data-testid="favourite-tradesman-card"
              className="h-full"
            >
              <FeaturedSimpleCard
                name={t.companyName || t.displayName}
                img={t.avatarUrl || null}
                onClick={() =>
                  router.push(`/tradesman/${encodeURIComponent(t.builderId)}`)
                }
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
