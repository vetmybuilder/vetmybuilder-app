// web/components/tradesmen/FavouritesListMobile.tsx
//
// Mobile redesign of the favourites screen (rendered when /projects?tab=favourites
// is hit on a small viewport). V1 "Card list (photo + meta)" layout —
// each saved tradesperson is a tall card with their work photo at the top,
// floating heart toggle, and stat chips below.
//
// When the favourite was added from a recommendation profile, tapping it
// routes back to /builders/<recId> so the homeowner sees the same rich view
// (AI summary, community comments, photos) they had when they saved it.
// Otherwise it falls back to the canonical /tradesman/<uid> profile.

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Heart, ShieldCheck, Star } from "lucide-react";

import { useApi } from "@/utils/api";
import { useMobileMenu } from "@/utils/mobileMenu";
import Link from "next/link";
import BrandWordmark from "@/components/BrandWordmark";

type FavouriteItem = {
  kind?: "tradesman" | "recommendation";
  builderId?: string;
  publicId?: string | null;
  companyName?: string | null;
  displayName: string;
  tradeTypes?: string | null;
  serviceAreas?: string[] | null;
  avatarUrl?: string | null;
  coverPhotoUrl?: string | null;
  score?: number | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
  chVerified?: boolean;
  badge?: string | null;
  tier?: string | null;
  recommendationId?: number | null;
  recommendationProjectId?: number | null;
  // recommendation-only fields
  projectId?: number | null;
  recommenderName?: string | null;
  linkedTradesmanUid?: string | null;
};

function itemKey(item: FavouriteItem): string {
  if (item.kind === "recommendation") return `rec-${item.recommendationId}`;
  return `tradesman-${item.builderId}`;
}

export default function FavouritesListMobile() {
  const api = useApi();
  const router = useRouter();
  const { openMenu } = useMobileMenu();

  const [items, setItems] = useState<FavouriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Latest live project — used to thread projectId through to the profile so
  // the project-scoped trust score / hire context is preserved.
  const [latestProjectId, setLatestProjectId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const proj = await api.get("/api/projects?tab=mine&limit=1");
        const data = (proj as any)?.data ?? proj;
        const first = Array.isArray(data?.items) ? data.items[0] : null;
        if (alive && first?.id) setLatestProjectId(first.id);
      } catch {
        // best-effort — profiles still work without projectId
      }

      try {
        const res = await api.get<{ items: FavouriteItem[] }>(
          "/api/tradesmen/favourites",
        );
        const data = (res as any)?.data ?? res;
        if (alive)
          setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api]);

  function open(item: FavouriteItem) {
    if (item.kind === "recommendation") {
      // Navigate to the rec profile page built in sub-task 3
      router.push(`/projects/${item.projectId}/recommendations/${item.recommendationId}`);
      return;
    }
    // Prefer the recommendation profile when the favourite came from one —
    // surfaces the same AI summary + community comments + photos the user
    // saw when they saved it.
    const projectId =
      item.recommendationProjectId ?? latestProjectId ?? null;
    const qs = projectId ? `?projectId=${projectId}` : "";
    if (item.recommendationId) {
      router.push(`/builders/${item.recommendationId}${qs}`);
      return;
    }
    const target = item.publicId || item.builderId;
    router.push(`/tradesman/${encodeURIComponent(target ?? "")}${qs}`);
  }

  async function unfavourite(item: FavouriteItem) {
    if (busy) return;
    const key = itemKey(item);
    setBusy(key);
    // Optimistic remove
    const previous = items;
    setItems((prev) => prev.filter((x) => itemKey(x) !== key));
    try {
      if (item.kind === "recommendation") {
        await api.post(`/api/recommendations/${item.recommendationId}/unfavourite`);
      } else {
        await api.delete(
          `/api/tradesmen/${encodeURIComponent(item.builderId ?? "")}/favourite`,
        );
      }
    } catch {
      // Roll back if it fails
      setItems(previous);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      className="fixed inset-0 bg-gray-50 overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="favourites-list-mobile"
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Top nav — wordmark + burger to match /projects */}
      <div className="flex items-center justify-between px-3.5 pt-1.5 pb-1">
        <Link href="/" aria-label="Go to homepage" className="inline-flex items-center">
          <BrandWordmark tone="indigo" />
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={openMenu}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-[18px] font-bold"
          data-testid="favourites-mobile-menu"
        >
          ≡
        </button>
      </div>

      {/* Hero */}
      <div className="px-5 pt-1 pb-3">
        <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 flex items-center gap-2">
          Favourites
          <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
        </h1>
        <p className="mt-1 text-[12.5px] text-gray-500">
          {loading
            ? "Loading…"
            : items.length === 0
            ? "Nothing saved yet."
            : `${items.length} in your favourites.`}
        </p>
      </div>

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="px-5 pt-4">
          <div
            className="rounded-2xl bg-white border border-gray-200 px-4 py-6 text-center"
            data-testid="favourites-empty"
          >
            <Heart className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <div className="text-[14px] font-extrabold text-gray-900">
              No favourites yet
            </div>
            <p className="mt-1 text-[12px] text-gray-500 leading-snug">
              Tap the heart on a builder profile to save them here for later.
            </p>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="px-5 pt-2 pb-12 space-y-2.5">
        {loading && items.length === 0 && [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        {items.map((item) => (
          <FavouriteCard
            key={itemKey(item)}
            item={item}
            busy={busy === itemKey(item)}
            onOpen={() => open(item)}
            onUnfavourite={() => unfavourite(item)}
          />
        ))}
      </div>
    </main>
  );
}

/* ---------- Subcomponents ---------- */

function FavouriteCard({
  item,
  busy,
  onOpen,
  onUnfavourite,
}: {
  item: FavouriteItem;
  busy: boolean;
  onOpen: () => void;
  onUnfavourite: () => void;
}) {
  const key = itemKey(item);
  const isRec = item.kind === "recommendation";

  const photo = item.coverPhotoUrl || item.avatarUrl || null;
  const trades = (item.tradeTypes || "")
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const area = item.serviceAreas?.[0] || null;
  const subline = [trades, area].filter(Boolean).join(" · ");
  // Tier comes from the real subscription state (free / spotlight / gold / unlock).
  // Do NOT fall back to vmb_badge — that field can be a stale marketing label
  // that misrepresents the builder's actual paid status.
  const badgeLabel = (item.tier || "").toUpperCase();
  const initials = (item.displayName || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const ratingText =
    typeof item.googleRating === "number" && item.googleRating > 0
      ? `${item.googleRating.toFixed(1)}${
          item.googleReviewsCount ? ` · ${item.googleReviewsCount}` : ""
        }`
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`favourite-card-${key}`}
      className="block w-full text-left bg-white border border-gray-200 rounded-[18px] overflow-hidden active:scale-[0.99] transition-transform"
    >
      {/* Hero photo (or initials disc fallback) */}
      <div
        className="relative bg-gray-100"
        style={{ aspectRatio: "16 / 9" }}
      >
        {photo ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${photo})` }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-white text-[30px] font-extrabold"
            style={{
              background: isRec
                ? "linear-gradient(135deg, #fcd34d, #f59e0b)"
                : "linear-gradient(135deg, #6ee7b7, #10b981)",
            }}
          >
            {initials}
          </div>
        )}

        {/* Heart toggle (unfavourite) */}
        <button
          type="button"
          aria-label="Remove from favourites"
          onClick={(e) => {
            e.stopPropagation();
            onUnfavourite();
          }}
          disabled={busy}
          className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center shadow-sm disabled:opacity-60"
          style={{
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(8px)",
          }}
          data-testid={`favourite-toggle-${key}`}
        >
          <Heart className="w-[18px] h-[18px] fill-rose-500 text-rose-500" />
        </button>

        {/* Top-left badge */}
        {isRec ? (
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
        ) : (
          badgeLabel && badgeLabel !== "FREE" && (
            <span
              className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold"
              style={{
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(8px)",
                color: "#4338ca",
              }}
            >
              {badgeLabel}
            </span>
          )
        )}
      </div>

      {/* Body */}
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
          {isRec && item.recommenderName && (
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
          {!isRec && ratingText && (
            <StatChip
              icon={<Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
              text={`${ratingText} Google`}
            />
          )}
          {!isRec && typeof item.score === "number" && item.score > 0 && (
            <StatChip
              tone="trust"
              icon={<Star className="w-3 h-3 fill-rose-400 text-rose-400" />}
              text={`${Math.round(item.score)} Trust`}
            />
          )}
          {!isRec && item.chVerified && (
            <StatChip
              tone="verified"
              icon={<ShieldCheck className="w-3 h-3" />}
              text="Verified"
            />
          )}
        </div>
      </div>
    </button>
  );
}

function StatChip({
  tone,
  icon,
  text,
}: {
  tone?: "trust" | "verified";
  icon: React.ReactNode;
  text: string;
}) {
  const cls =
    tone === "verified"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : tone === "trust"
      ? "bg-white border-rose-200 text-gray-800"
      : "bg-gray-50 border-gray-200 text-gray-800";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border-[1.5px] text-[10.5px] font-bold ${cls}`}
    >
      <span className="text-[11px] leading-none">{icon}</span>
      <span>{text}</span>
    </span>
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
