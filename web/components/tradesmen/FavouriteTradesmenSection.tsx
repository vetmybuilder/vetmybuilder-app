// web/components/tradesmen/FavouriteTradesmenSection.tsx
import * as React from "react";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";

type FavouriteItem = {
  kind?: "tradesman" | "recommendation";
  // tradesman fields
  builderId?: string;
  publicId?: string | null;
  displayName: string;
  companyName?: string | null;
  avatarUrl?: string | null;
  coverPhotoUrl?: string | null;
  score?: number | null;
  tradeTypes?: string | null;
  // recommendation-only fields
  recommendationId?: number | null;
  projectId?: number | null;
  recommenderName?: string | null;
};

function itemKey(item: FavouriteItem): string {
  if (item.kind === "recommendation") return `rec-${item.recommendationId}`;
  return `tradesman-${item.builderId}`;
}

export default function FavouriteTradesmenSection() {
  const api = useApi();
  const router = useRouter();

  const [items, setItems] = React.useState<FavouriteItem[]>([]);
  const [latestProjectId, setLatestProjectId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  async function fetchFavourites(cancelled: () => boolean) {
    try {
      setLoading(true);

      // Fetch the user's most recent live project for the hire button context
      try {
        const projRes = await api.get("/api/projects?tab=mine&limit=1");
        const projData = (projRes as any)?.data ?? projRes;
        const firstProject = Array.isArray(projData?.items) ? projData.items[0] : null;
        if (!cancelled() && firstProject?.id) {
          setLatestProjectId(firstProject.id);
        }
      } catch {}
      setError(null);
      const res = await api.get("/api/tradesmen/favourites");
      const data = (res as any)?.data ?? res;
      const list: any[] = Array.isArray(data?.items) ? data.items : [];
      if (!cancelled()) {
        setItems(list.map((t) => ({
          kind: t.kind || "tradesman",
          builderId: t.builderId,
          displayName: t.displayName || t.companyName || "Tradesman",
          companyName: t.companyName,
          avatarUrl: t.avatarUrl || null,
          coverPhotoUrl: t.coverPhotoUrl || null,
          score: typeof t.score === "number" && Number.isFinite(t.score) ? t.score : null,
          tradeTypes: t.tradeTypes || null,
          publicId: t.publicId || null,
          recommendationId: t.recommendationId ?? null,
          projectId: t.projectId ?? null,
          recommenderName: t.recommenderName ?? null,
        })));
      }
    } catch (e: any) {
      if (!cancelled()) {
        setError(e?.response?.data?.error || e?.message || "Failed to load favourites");
      }
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }

  React.useEffect(() => {
    let _cancelled = false;
    fetchFavourites(() => _cancelled);
    return () => { _cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function handleUnfavouriteRec(recId: number | string) {
    try {
      await api.post(`/api/recommendations/${recId}/unfavourite`);
      let _cancelled = false;
      fetchFavourites(() => _cancelled);
    } catch {
      // optional toast
    }
  }

  function handleOpen(item: FavouriteItem) {
    if (item.kind === "recommendation") {
      router.push(`/projects/${item.projectId}/recommendations/${item.recommendationId}`);
      return;
    }
    const base = `/tradesman/${encodeURIComponent(item.publicId || item.builderId || "")}`;
    const href = latestProjectId ? `${base}?projectId=${latestProjectId}` : base;
    router.push(href);
  }

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
          <>
            <p className="text-xs text-zinc-400 mb-3">{items.length} in your favourites</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((t) => {
                const isRec = t.kind === "recommendation";
                const name = t.companyName || t.displayName;
                const initials = (name.split(" ")[0]?.[0] || "T").toUpperCase();
                const photo = t.coverPhotoUrl || t.avatarUrl || null;

                return (
                  <div key={itemKey(t)} className="relative">
                    <button
                      type="button"
                      onClick={() => handleOpen(t)}
                      className="w-full flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm hover:shadow-md transition-shadow"
                      data-testid="favourite-tradesman-card"
                    >
                      {/* Avatar / cover */}
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl grid place-items-center"
                        style={{
                          background: isRec
                            ? "linear-gradient(135deg, #fcd34d, #f59e0b)"
                            : "#e4e4e7",
                        }}
                      >
                        {photo ? (
                          <img src={photo} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-lg font-black text-white">
                            {initials}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {isRec && (
                          <span className="inline-block mb-1 text-[10px] font-extrabold rounded-full px-2 py-0.5"
                            style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}
                          >
                            ⭐ Recommendation
                          </span>
                        )}
                        <h3 className="text-base font-bold text-zinc-900 truncate">{name}</h3>
                        {t.tradeTypes && (
                          <p className="mt-0.5 text-xs text-zinc-500 truncate">
                            {t.tradeTypes.split(",").slice(0, 3).map((s: string) => s.trim()).join(" · ")}
                          </p>
                        )}
                        {isRec && t.recommenderName && (
                          <span className="mt-1 inline-block text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={{ background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe" }}
                          >
                            By {t.recommenderName}
                          </span>
                        )}
                        {!isRec && t.score != null && t.score > 0 && (
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

                    {/* Unfavourite heart for rec cards */}
                    {isRec && (
                      <button
                        type="button"
                        aria-label="Remove from favourites"
                        onClick={() => t.recommendationId != null && handleUnfavouriteRec(t.recommendationId)}
                        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white border border-zinc-200 flex items-center justify-center shadow-sm hover:bg-rose-50 transition-colors"
                        data-testid={`favourite-rec-heart-${t.recommendationId}`}
                      >
                        <svg className="h-4 w-4 fill-rose-500 text-rose-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
