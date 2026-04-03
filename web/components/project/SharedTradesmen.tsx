// web/components/project/SharedTradesmen.tsx
import * as React from "react";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import SwipeCarousel from "@/components/SwipeCarousel";

type TradeSharePhoto = {
  url?: string;
  absoluteUrl?: string;
};

type TradeShare = {
  id: number;
  projectId: number;
  projectName: string | null;
  tradesmanUid: string;
  tradesmanPublicId?: string | null;
  companyName?: string | null;
  photos?: TradeSharePhoto[];
  primaryPhotoUrl?: string | null;
  message: string;
  createdAt: string;
};

type SharedTradesmenProps = {
  projectId: number | string;
};

function getPhotoUrlFromPhoto(p: TradeSharePhoto): string | null {
  return p.absoluteUrl || p.url || null;
}

function resolvePhotoUrl(share: TradeShare): string | null {
  if (share.primaryPhotoUrl) return share.primaryPhotoUrl;
  if (Array.isArray(share.photos) && share.photos.length > 0) {
    const candidate = share.photos.map(getPhotoUrlFromPhoto).find(Boolean);
    if (candidate) return candidate;
  }
  return null;
}

function initialsFromName(name: string | null | undefined): string {
  const clean = (name || "").trim();
  if (!clean) return "T";
  const parts = clean.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b || clean.slice(0, 2)).toUpperCase();
}

type SharedCardProps = {
  share: TradeShare;
  onClick?: () => void;
};

function SharedCard({ share, onClick }: SharedCardProps) {
  const name =
    share.companyName && share.companyName.trim().length
      ? share.companyName.trim()
      : "A tradesperson";

  const imgSrc = resolvePhotoUrl(share);
  const initials = initialsFromName(name);

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="shared-tradesman-card"
      className={[
        "w-full",
        "rounded-full border border-sky-100 bg-sky-50 px-4 py-2",
        "flex items-center gap-3 text-left shadow-sm",
        "hover:bg-sky-100 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
      ].join(" ")}
    >
      <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-200 overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt={name} className="h-full w-full object-cover" data-testid="shared-tradesman-avatar-photo" />
        ) : (
          <span className="text-xs font-semibold text-slate-700" data-testid="shared-tradesman-avatar-initials">
            {initials}
          </span>
        )}
      </span>
      <span className="text-sm font-medium text-slate-900">
        <span className="font-semibold">{name}</span>{" "}
        <span className="text-slate-700">
          is interested in your job post and has shared their profile. Click to
          view.
        </span>
      </span>
    </button>
  );
}

export default function SharedTradesmen({ projectId }: SharedTradesmenProps) {
  const api = useApi();
  const router = useRouter();

  const [loaded, setLoaded] = React.useState(false);
  const [shares, setShares] = React.useState<TradeShare[]>([]);

  // Reusable fetcher
  const fetchShares = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await api.get("/api/tradesmen/shares", {
        params: { projectId, limit: 50 },
      } as any);
      const data: any = (res as any)?.data ?? res;
      const rows: TradeShare[] = Array.isArray(data?.shares) ? data.shares : [];
      setShares(rows);
      setLoaded(true);
    } catch {
      setShares([]);
      setLoaded(true);
    }
  }, [api, projectId]);

  // Initial load
  React.useEffect(() => {
    setLoaded(false);
    setShares([]);
    fetchShares();
  }, [fetchShares]);

  // Poll every 15s while tab is visible
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const onVis = () => {
      if (!document.hidden) {
        fetchShares();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    const id = window.setInterval(() => {
      if (!document.hidden) {
        fetchShares();
      }
    }, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [fetchShares]);

  if (!loaded || shares.length === 0) return null;

  const handleClick = (share: TradeShare) => {
    const id = share.tradesmanPublicId || share.tradesmanUid;
    if (!id) return;
    router.push(`/tradesman/${id}`);
  };

  const slides = shares.map((share) => (
    <SharedCard
      key={share.id}
      share={share}
      onClick={() => handleClick(share)}
    />
  ));

  return (
    <section
      aria-label="Tradespeople who have shared their profile with you"
      className="mb-6"
      data-testid="shared-tradesmen-strip"
    >
      <SwipeCarousel items={slides} className="w-full" />
    </section>
  );
}
