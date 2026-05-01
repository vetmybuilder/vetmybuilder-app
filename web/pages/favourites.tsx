// web/pages/favourites.tsx
//
// Dedicated /favourites page using the new design language (cream
// backdrop, brand watermark, amber-bordered cards, indigo + Caveat
// chrome). Variant B "compact rows" - LinkedIn-style horizontal list.
// Favourites also still appear inside /projects as a tab; this page is
// a standalone destination so the route is shareable / bookmark-able.

import Head from "next/head";
import { useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import Layout from "@/components/Layout";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import Toast from "@/components/Toast";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import {
  ChevronLeft,
  Heart,
  ShieldCheck,
  Star,
  MapPin,
  HeartCrack,
} from "lucide-react";

type FavouriteItem = {
  builderId: string;
  publicId: string | null;
  companyName: string | null;
  displayName: string;
  avatarUrl: string | null;
  serviceAreas: string[];
  tradeTypes: string | null;
  stats: { completed: number; photos: number; reviews: number };
  googleRating: number | null;
  googleReviewsCount: number;
  chVerified: boolean;
  favouritedAt: string | null;
};

export default function FavouritesPage() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState<FavouriteItem[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/tradesmen/favourites");
        const data: any = (res as any)?.data ?? res;
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? (data.items as FavouriteItem[]) : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const unfavourite = async (builderId: string) => {
    if (!builderId || removing) return;
    setRemoving(builderId);
    // Optimistic remove so the row disappears immediately. Re-add on
    // failure so the user sees the actual state.
    const previous = items;
    setItems((cur) => (cur ? cur.filter((it) => it.builderId !== builderId) : cur));
    try {
      await api.delete(`/api/tradesmen/${encodeURIComponent(builderId)}/favourite`);
      setToast("Removed from favourites");
    } catch {
      setItems(previous);
      setToast("Couldn't remove favourite. Try again?");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <Head>
        <title>Your shortlist - VetMyBuilder</title>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <Layout>
        <div
          className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-14 relative overflow-hidden"
          data-testid="favourites-page"
        >
          <BrandWatermarkScatter />

          <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 pt-3">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/projects"))}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors mb-5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            {/* Page heading */}
            <div className="text-center mb-7 sm:mb-9">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-1">
                Saved
              </div>
              <h1
                className="text-[26px] sm:text-[32px] font-black tracking-tight text-slate-900 leading-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Your{" "}
                <span
                  className="text-indigo-600"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "118%" }}
                >
                  shortlist
                </span>
              </h1>
              {items && items.length > 0 && (
                <p className="mt-2 text-[13px] text-slate-500">
                  {items.length} {items.length === 1 ? "tradesperson" : "tradespeople"} you&apos;ve saved
                </p>
              )}
            </div>

            {items === null && <LoadingSkeleton />}
            {items && items.length === 0 && <EmptyState />}
            {items && items.length > 0 && (
              <div className="space-y-3" data-testid="favourites-list">
                {items.map((item) => (
                  <FavouriteRow
                    key={item.builderId}
                    item={item}
                    onUnfavourite={unfavourite}
                    removing={removing === item.builderId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Layout>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function FavouriteRow({
  item,
  onUnfavourite,
  removing,
}: {
  item: FavouriteItem;
  onUnfavourite: (builderId: string) => void;
  removing: boolean;
}) {
  const trades = parseTrades(item.tradeTypes);
  const profileHref = `/tradesman/${encodeURIComponent(item.publicId || item.builderId)}`;
  const savedAgo = formatSavedAgo(item.favouritedAt);

  return (
    <article
      className={`bg-white rounded-3xl border border-amber-100 shadow-sm p-4 sm:p-5 flex items-start gap-3 sm:gap-4 hover:border-amber-200 transition-colors ${
        removing ? "opacity-50" : ""
      }`}
      data-testid={`favourite-row-${item.builderId}`}
    >
      <a
        href={profileHref}
        className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-sm sm:text-base font-black flex-shrink-0 overflow-hidden"
      >
        {item.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={item.avatarUrl} alt={item.displayName} className="w-full h-full object-cover" />
        ) : (
          <span>{initials(item.displayName)}</span>
        )}
      </a>

      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1">
          <a
            href={profileHref}
            className="text-[15px] sm:text-[16px] font-black tracking-tight text-slate-900 leading-tight truncate hover:text-indigo-700 transition-colors"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {item.displayName}
          </a>
          {item.chVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10.5px] font-extrabold">
              <ShieldCheck className="w-2.5 h-2.5" />
              Verified
            </span>
          )}
          {item.googleRating != null && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-amber-900">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {item.googleRating.toFixed(1)}
              <span className="text-slate-400 font-normal">({item.googleReviewsCount})</span>
            </span>
          )}
        </div>

        {trades.length > 0 && (
          <div className="text-[12.5px] text-slate-600 truncate mb-1.5">
            {trades.slice(0, 4).join(" · ")}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
          {item.serviceAreas.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-amber-500" />
              {item.serviceAreas.slice(0, 3).join(", ")}
            </span>
          )}
          {item.stats.completed > 0 && (
            <>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span>
                {item.stats.completed} {item.stats.completed === 1 ? "job" : "jobs"}
              </span>
            </>
          )}
          {savedAgo && (
            <>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span>{savedAgo}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onUnfavourite(item.builderId)}
          disabled={removing}
          aria-label="Remove from favourites"
          className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-rose-50 border border-rose-100 hover:bg-rose-100 disabled:cursor-wait transition-colors"
          data-testid={`btn-unfavourite-${item.builderId}`}
        >
          <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
        </button>
        <a
          href={profileHref}
          className="inline-flex items-center justify-center rounded-full px-4 py-1.5 text-[11.5px] font-extrabold text-white"
          style={{
            backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
            boxShadow: "0 4px 12px rgba(99,102,241,0.25)",
          }}
        >
          View
        </a>
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white rounded-3xl border border-amber-100 shadow-sm p-5 flex items-start gap-4"
        >
          <div className="h-16 w-16 rounded-2xl bg-amber-100 animate-pulse" />
          <div className="flex-1 space-y-2.5 pt-2">
            <div className="h-3 w-1/2 bg-amber-100 rounded-full animate-pulse" />
            <div className="h-2.5 w-3/4 bg-amber-50 rounded-full animate-pulse" />
            <div className="h-2.5 w-1/3 bg-amber-50 rounded-full animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="bg-white rounded-3xl border border-amber-100 shadow-sm p-10 text-center"
      data-testid="favourites-empty"
    >
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <HeartCrack className="w-6 h-6 text-rose-400" />
      </div>
      <h2
        className="text-[20px] font-black tracking-tight text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        Nothing saved yet
      </h2>
      <p className="mt-2 text-[13px] text-slate-500 leading-relaxed max-w-sm mx-auto">
        Tap the heart on any tradesperson&apos;s profile to keep them here for later.
      </p>
      <a
        href="/projects"
        className="mt-6 inline-flex items-center justify-center rounded-full px-6 py-3 text-[13px] font-extrabold text-white"
        style={{
          backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
          boxShadow: "0 8px 22px rgba(99,102,241,0.3)",
        }}
      >
        Browse your jobs
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseTrades(s: string | null | undefined): string[] {
  if (!s) return [];
  return String(s)
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatSavedAgo(input: string | null | undefined): string | null {
  if (!input) return null;
  const ts = Date.parse(input);
  if (!Number.isFinite(ts)) return null;
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "Saved just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Saved yesterday";
  if (days < 7) return `Saved ${days} days ago`;
  if (days < 14) return "Saved last week";
  if (days < 30) return `Saved ${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `Saved ${Math.floor(days / 30)} months ago`;
  return `Saved ${Math.floor(days / 365)} years ago`;
}
