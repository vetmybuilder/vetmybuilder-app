// web/components/tradesmen/RecommendationsListMobile.tsx
//
// Mobile screen for the cross-project Recommendations tab. Flat list of
// recommendations on the cream backdrop: thumbnail, company, trade,
// average rating, recommender chip. Tap a row to open the full
// recommendation / profile page (which surfaces ratings, comment,
// photos in detail).
//
// Live-updates via SSE: a `recommendation_new` window event triggers a
// refetch so a fresh recommendation appears without a manual reload.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { ChevronLeft, ChevronRight, Sparkles, Star } from "lucide-react";

import { useApi } from "@/utils/api";
import { useMobileMenu } from "@/utils/mobileMenu";
import Link from "next/link";

type Ratings = {
  quality: number | null;
  reliability: number | null;
  communication: number | null;
  trust: number | null;
  value: number | null;
};

type RecommendationItem = {
  kind: "recommendation";
  recommendationId: number;
  projectId: number;
  projectName: string | null;
  companyName: string | null;
  displayName: string;
  recommenderName: string | null;
  coverPhotoUrl: string | null;
  photoUrls: string[];
  tradeTypes: string | null;
  linkedTradesmanUid: string | null;
  createdAt: string;
  rating: number | null;
  comment: string | null;
  ratings: Ratings;
};

function avgRating(r: Ratings): number {
  const vals = [
    r.quality,
    r.reliability,
    r.communication,
    r.trust,
    r.value,
  ].filter((n): n is number => typeof n === "number" && n > 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function MiniStars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={11}
          height={11}
          className={
            i <= Math.round(n)
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-slate-300"
          }
        />
      ))}
    </span>
  );
}

function Thumb({ rec }: { rec: RecommendationItem }) {
  if (rec.coverPhotoUrl) {
    return (
      <div
        className="w-14 h-14 rounded-2xl bg-cover bg-center shrink-0"
        style={{ backgroundImage: `url(${rec.coverPhotoUrl})` }}
      />
    );
  }
  const initials = (rec.displayName || rec.companyName || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[14px] font-extrabold shrink-0"
      style={{ background: "linear-gradient(135deg,#a5b4fc,#6366f1)" }}
    >
      {initials}
    </div>
  );
}

function RecRow({
  rec,
  onOpen,
}: {
  rec: RecommendationItem;
  onOpen: () => void;
}) {
  const avg = avgRating(rec.ratings);
  const hasRatings = avg > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`recommendation-card-${rec.recommendationId}`}
      className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-indigo-50/60 transition-colors border-b border-slate-200/70"
    >
      <Thumb rec={rec} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14.5px] font-extrabold text-slate-900 truncate">
            {rec.companyName || rec.displayName}
          </span>
          {rec.linkedTradesmanUid && (
            <span className="text-[10px] font-bold text-emerald-600 shrink-0">
              ✓ Verified
            </span>
          )}
        </div>
        {rec.tradeTypes && (
          <div className="text-[11.5px] text-slate-500 truncate">
            {rec.tradeTypes}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {hasRatings && (
            <span className="inline-flex items-center gap-1">
              <MiniStars n={avg} />
              <span className="text-[11px] font-extrabold text-slate-900">
                {avg.toFixed(1)}
              </span>
            </span>
          )}
          {rec.recommenderName && (
            <span className="text-[11px] text-indigo-700 truncate">
              {hasRatings && <span className="text-slate-300">·</span>} By{" "}
              <span className="font-bold">{rec.recommenderName}</span>
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    </button>
  );
}

function SkeletonRow() {
  return (
    <div
      className="px-4 py-4 flex items-center gap-3 border-b border-slate-200/70"
      aria-hidden="true"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-200/60 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/3 bg-slate-200/80 rounded" />
        <div className="h-3 w-1/2 bg-slate-200/50 rounded" />
        <div className="h-3 w-1/3 bg-slate-200/50 rounded" />
      </div>
    </div>
  );
}

export default function RecommendationsListMobile() {
  const api = useApi();
  const router = useRouter();
  const { openMenu } = useMobileMenu();

  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await api.get<{ items: RecommendationItem[] }>(
        "/api/recommendations/inbox",
      );
      const data = (res as any)?.data ?? res;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      await fetchInbox();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [fetchInbox]);

  // Live: refetch on incoming `recommendation_new` notification.
  useEffect(() => {
    function onNotif(e: Event) {
      const data = (e as CustomEvent).detail || {};
      const t = String(data?.type || "").toLowerCase();
      if (t === "recommendation_new") {
        fetchInbox();
      }
    }
    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
  }, [fetchInbox]);

  function open(item: RecommendationItem) {
    router.push(
      `/builders/${item.recommendationId}?projectId=${item.projectId}`,
    );
  }

  return (
    <main
      className="min-h-screen bg-white md:bg-transparent"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="recommendations-list-mobile"
    >
      <div className="h-[env(safe-area-inset-top)] md:hidden" />

      <div className="md:hidden flex items-center justify-between px-3.5 pt-1.5 pb-1">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-700">
          <Sparkles className="w-3 h-3" />
          {loading ? "Loading…" : `${items.length} from your network`}
        </span>
        <button
          type="button"
          aria-label="Open menu"
          onClick={openMenu}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-[18px] font-bold"
          data-testid="recommendations-mobile-menu"
        >
          ≡
        </button>
      </div>

      <div className="px-4 md:px-0 pt-2 pb-4">
        <h1
          className="text-[26px] md:text-3xl font-black tracking-tight text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Your community{" "}
          <span
            className="text-indigo-600"
            style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
          >
            recommends
          </span>
        </h1>
        <p className="mt-1.5 text-[13px] md:text-sm text-slate-500 leading-relaxed">
          Trusted tradespeople, suggested by people you know. Tap a row to see
          the full review.
        </p>
      </div>

      {!loading && items.length === 0 && (
        <div className="px-4 md:px-0 pt-2">
          <div className="rounded-2xl bg-white shadow-sm px-6 py-12 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-indigo-500" />
            </span>
            <div className="text-[16px] font-black tracking-tight text-slate-900">
              Nothing yet
            </div>
            <p className="mt-1.5 text-[13px] text-slate-500 leading-relaxed max-w-md mx-auto">
              When a friend recommends a tradesperson for one of your jobs,
              their profile will land here so you can pick up the conversation.
            </p>
            <Link
              href="/projects"
              className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-extrabold text-white shadow-sm hover:shadow-md transition-all"
              style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
            >
              Invite your community
            </Link>
          </div>
        </div>
      )}

      <div className="pt-2 pb-12">
        {loading && items.length === 0
          ? [0, 1, 2].map((i) => <SkeletonRow key={i} />)
          : items.map((item) => (
              <RecRow
                key={item.recommendationId}
                rec={item}
                onOpen={() => open(item)}
              />
            ))}
      </div>
    </main>
  );
}
