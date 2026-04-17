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
  tradeTypes?: string | null;
};

export default function FavouriteTradesmenSection() {
  const api = useApi();
  const router = useRouter();

  const [items, setItems] = React.useState<FavouriteTradesmanLite[]>([]);
  const [latestProjectId, setLatestProjectId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // Fetch the user's most recent live project for the hire button context
        try {
          const projRes = await api.get("/api/projects?tab=mine&limit=1");
          const projData = (projRes as any)?.data ?? projRes;
          const firstProject = Array.isArray(projData?.items) ? projData.items[0] : null;
          if (!cancelled && firstProject?.id) {
            setLatestProjectId(firstProject.id);
          }
        } catch {}
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
              tradeTypes: t.tradeTypes || null,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map((t) => {
              const name = t.companyName || t.displayName;
              const initials = (name.split(" ")[0]?.[0] || "T").toUpperCase();
              const base = `/tradesman/${encodeURIComponent(t.publicId || t.builderId)}`;
              const href = latestProjectId ? `${base}?projectId=${latestProjectId}` : base;

              return (
                <button
                  key={t.builderId}
                  type="button"
                  onClick={() => router.push(href)}
                  className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm hover:shadow-md transition-shadow"
                  data-testid="favourite-tradesman-card"
                >
                  {/* Avatar */}
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-200 grid place-items-center">
                    {t.avatarUrl ? (
                      <img src={t.avatarUrl} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-black text-white bg-red-500 h-full w-full grid place-items-center">
                        {initials}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-zinc-900 truncate">{name}</h3>
                    {t.tradeTypes && (
                      <p className="mt-0.5 text-xs text-zinc-500 truncate">
                        {t.tradeTypes.split(",").slice(0, 3).map((s: string) => s.trim()).join(" · ")}
                      </p>
                    )}
                    {t.score != null && t.score > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold text-white ${
                          t.score >= 55 ? "bg-emerald-500" : t.score >= 30 ? "bg-amber-500" : "bg-red-500"
                        }`}>
                          {Math.round(t.score)}
                        </span>
                        <span className="text-xs text-zinc-400">Trust score</span>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg className="h-5 w-5 text-zinc-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
