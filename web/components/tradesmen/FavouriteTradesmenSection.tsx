// web/components/tradesmen/FavouriteTradesmenSection.tsx
import * as React from "react";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import FeaturedSimpleCard from "@/components/tradesmen/FeaturedSimpleCard";

export type FavouriteTradesmanLite = {
  builderId: string;
  publicId?: string | null;
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
    >
      <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
        <h2 className="text-lg font-bold tracking-tight text-zinc-900 mb-4">
          Favourite builders
        </h2>

        {loading && (
          <p className="text-sm text-zinc-500" data-testid="favourites-loading">
            Loading favourites&hellip;
          </p>
        )}

        {error && !loading && (
          <p className="text-sm text-rose-600" data-testid="favourites-error">
            {error}
          </p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-zinc-500" data-testid="favourites-empty">
            You haven&apos;t saved any builders yet. Tap the &ldquo;Save to
            favourites&rdquo; button on a builder profile to see them here.
          </p>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    router.push(
                      `/tradesman/${encodeURIComponent(t.publicId || t.builderId)}`
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
