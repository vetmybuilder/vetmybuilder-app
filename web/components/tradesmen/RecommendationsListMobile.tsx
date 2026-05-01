// web/components/tradesmen/RecommendationsListMobile.tsx
//
// Mobile screen for the cross-project Recommendations tab. Lists every
// recommendation made on any of the homeowner's projects (linked to a
// VetMyBuilder tradesman or off-platform alike), using the same card
// design as the recommendation rows previously surfaced in Favourites.
//
// Live-updates via SSE: when /api/projects/:id/recommendations.post
// broadcasts `recommendation_new` to the project owner, this view
// refetches so a fresh recommendation appears without a manual reload.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { Sparkles } from "lucide-react";

import { useApi } from "@/utils/api";
import { useMobileMenu } from "@/utils/mobileMenu";
import Link from "next/link";
import BrandWordmark from "@/components/BrandWordmark";

type RecommendationItem = {
  kind: "recommendation";
  recommendationId: number;
  projectId: number;
  projectName: string | null;
  companyName: string | null;
  displayName: string;
  recommenderName: string | null;
  coverPhotoUrl: string | null;
  tradeTypes: string | null;
  linkedTradesmanUid: string | null;
  createdAt: string;
};

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
  // `vmb:notification` is dispatched by GlobalSseDispatcher from the single
  // app-wide SSE connection.
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
      `/projects/${item.projectId}/recommendations/${item.recommendationId}`,
    );
  }

  return (
    <main
      // Mobile: full-screen overlay with its own chrome (BrandWordmark +
      // burger). Desktop: integrate into the parent cream layout - the
      // wrapper drops the fixed positioning + gray bg, and the mobile-only
      // top header is hidden via md:hidden below.
      className="fixed inset-0 bg-gray-50 overflow-y-auto md:static md:inset-auto md:bg-transparent md:overflow-visible"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      data-testid="recommendations-list-mobile"
    >
      <div className="h-[env(safe-area-inset-top)] md:hidden" />

      <div className="md:hidden flex items-center justify-between px-3.5 pt-1.5 pb-1">
        <Link href="/" aria-label="Go to homepage" className="inline-flex items-center">
          <BrandWordmark tone="indigo" />
        </Link>
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

      <div className="px-5 md:px-0 pt-1 pb-3">
        <h1
          className="text-[24px] md:text-3xl font-black tracking-tight text-slate-900"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Recommendations
        </h1>
        <p className="mt-1 text-[12.5px] md:text-sm text-slate-500">
          {loading
            ? "Loading…"
            : items.length === 0
              ? "Tradespeople your community recommends for your jobs will appear here."
              : `${items.length} from your network.`}
        </p>
      </div>

      {!loading && items.length === 0 && (
        <div className="px-5 md:px-0 pt-4">
          <div className="rounded-3xl bg-white border border-amber-100 shadow-sm px-6 py-12 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-amber-500" />
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

      <div className="px-5 md:px-0 pt-2 pb-12 md:pb-0 space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {loading &&
          items.length === 0 &&
          [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        {items.map((item) => (
          <RecommendationCard
            key={item.recommendationId}
            item={item}
            onOpen={() => open(item)}
          />
        ))}
      </div>
    </main>
  );
}

function RecommendationCard({
  item,
  onOpen,
}: {
  item: RecommendationItem;
  onOpen: () => void;
}) {
  const photo = item.coverPhotoUrl || null;
  const trades = (item.tradeTypes || "")
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const subline = [trades, item.projectName].filter(Boolean).join(" · ");
  const initials = (item.displayName || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`recommendation-card-${item.recommendationId}`}
      className="block w-full text-left bg-white border border-gray-200 rounded-[18px] overflow-hidden active:scale-[0.99] transition-transform"
    >
      <div className="relative bg-gray-100" style={{ aspectRatio: "16 / 9" }}>
        {photo ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${photo})` }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-white text-[30px] font-extrabold"
            style={{
              background: "linear-gradient(135deg, #fcd34d, #f59e0b)",
            }}
          >
            {initials}
          </div>
        )}

        <span
          className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold"
          style={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(8px)",
            color: "#b45309",
          }}
        >
          ⭐ Recommendation
        </span>
      </div>

      <div className="px-3.5 py-3">
        <div className="text-[15px] font-extrabold tracking-tight text-gray-900 truncate">
          {item.companyName || item.displayName}
        </div>
        {subline && (
          <div className="mt-0.5 text-[11.5px] text-gray-500 truncate">
            {subline}
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.recommenderName && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 border-[1.5px] text-[10.5px] font-bold"
              style={{
                background: "#eef2ff",
                borderColor: "#c7d2fe",
                color: "#4338ca",
              }}
            >
              By {item.recommenderName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div
      className="bg-white border border-gray-200 rounded-[18px] overflow-hidden"
      aria-hidden="true"
    >
      <div className="aspect-[16/9] bg-gray-100" />
      <div className="px-3.5 py-3">
        <div className="h-3.5 w-2/3 bg-gray-200 rounded" />
        <div className="mt-2 h-3 w-1/2 bg-gray-100 rounded" />
        <div className="mt-3 flex gap-1.5">
          <div className="h-5 w-16 bg-gray-100 rounded-full" />
          <div className="h-5 w-14 bg-gray-100 rounded-full" />
        </div>
      </div>
    </div>
  );
}
